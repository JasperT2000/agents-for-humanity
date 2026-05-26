import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  pathwayProposals,
  pathwayVotes,
  pathways,
  perspectives,
  posts,
  problems,
  proposals,
} from "@/db/schema";
import { recordActivity, type ActivityActor } from "@/lib/activity/record";
import { findPerspectiveHeldByAgent } from "@/lib/perspectives/manage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const PATHWAY_LABEL_MIN = 1;
export const PATHWAY_LABEL_MAX = 60;
export const PATHWAY_DESCRIPTION_MIN = 30;
export const PATHWAY_DESCRIPTION_MAX = 2000;
export const PATHWAY_CONTEXT_MAX = 500;
export const PATHWAY_MIN_PROPOSALS = 2;
export const PATHWAY_ACCEPT_YES_THRESHOLD = 5;

export const PATHWAY_STATUS_VALUES = ["voting", "accepted", "rejected", "withdrawn"] as const;
export type PathwayStatus = (typeof PATHWAY_STATUS_VALUES)[number];

export type ManageError =
  | "PROBLEM_NOT_FOUND"
  | "PATHWAY_NOT_FOUND"
  | "DUPLICATE_LABEL"
  | "TOO_FEW_PROPOSALS"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_NOT_IN_PROBLEM"
  | "PROPOSAL_NOT_ACCEPTED"
  | "PATHWAY_NOT_VOTING"
  | "ALREADY_VOTED"
  | "VOTER_NOT_ENGAGED"
  | "INVALID_INPUT"
  | "DATABASE_UNAVAILABLE";

// =============================================================================
// Create
// =============================================================================

export async function createPathway(params: {
  problemId: string;
  label: string;
  description: string;
  recommendedForContext?: string;
  proposalIds: string[];
  createdByAgentId?: string;
  createdByUserId?: string;
}): Promise<
  | {
      pathway: {
        id: string;
        label: string;
        status: PathwayStatus;
        createdAt: Date;
      };
      proposals_attached: number;
    }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT", detail: "problem_id must be a UUID" };
  const label = params.label.trim();
  if (label.length < PATHWAY_LABEL_MIN || label.length > PATHWAY_LABEL_MAX) {
    return { error: "INVALID_INPUT", detail: `label ${PATHWAY_LABEL_MIN}–${PATHWAY_LABEL_MAX} chars` };
  }
  const description = params.description.trim();
  if (description.length < PATHWAY_DESCRIPTION_MIN || description.length > PATHWAY_DESCRIPTION_MAX) {
    return { error: "INVALID_INPUT", detail: `description ${PATHWAY_DESCRIPTION_MIN}–${PATHWAY_DESCRIPTION_MAX} chars` };
  }
  const context = params.recommendedForContext?.trim() || null;
  if (context && context.length > PATHWAY_CONTEXT_MAX) {
    return { error: "INVALID_INPUT", detail: `recommended_for_context ≤${PATHWAY_CONTEXT_MAX} chars` };
  }
  const uniqueProposalIds = Array.from(new Set(params.proposalIds));
  if (uniqueProposalIds.length < PATHWAY_MIN_PROPOSALS) {
    return { error: "TOO_FEW_PROPOSALS", detail: `at least ${PATHWAY_MIN_PROPOSALS} distinct proposals required` };
  }
  for (const id of uniqueProposalIds) {
    if (!isUuid(id)) return { error: "INVALID_INPUT", detail: "every proposal_id must be a UUID" };
  }
  const hasAgent = typeof params.createdByAgentId === "string";
  const hasUser = typeof params.createdByUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of createdByAgentId / createdByUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  // Problem exists?
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, params.problemId),
    columns: { id: true },
  });
  if (!problem) return { error: "PROBLEM_NOT_FOUND" };

  // Dup label?
  const dup = await db
    .select({ id: pathways.id })
    .from(pathways)
    .where(and(eq(pathways.problemId, params.problemId), sql`lower(${pathways.label}) = lower(${label})`));
  if (dup.length > 0) {
    return { error: "DUPLICATE_LABEL", detail: `"${label}" already exists on this problem` };
  }

  // All proposals exist + belong to problem + are accepted
  const found = await db
    .select({
      id: proposals.id,
      problemId: proposals.problemId,
      status: proposals.status,
    })
    .from(proposals)
    .where(inArray(proposals.id, uniqueProposalIds));

  if (found.length !== uniqueProposalIds.length) {
    const foundSet = new Set(found.map((p) => p.id));
    const missing = uniqueProposalIds.filter((id) => !foundSet.has(id));
    return { error: "PROPOSAL_NOT_FOUND", detail: `missing proposal(s): ${missing.join(", ")}` };
  }
  const wrongProblem = found.filter((p) => p.problemId !== params.problemId);
  if (wrongProblem.length > 0) {
    return {
      error: "PROPOSAL_NOT_IN_PROBLEM",
      detail: `proposal(s) belong to a different problem: ${wrongProblem.map((p) => p.id).join(", ")}`,
    };
  }
  const notAccepted = found.filter((p) => p.status !== "accepted");
  if (notAccepted.length > 0) {
    return {
      error: "PROPOSAL_NOT_ACCEPTED",
      detail: `proposal(s) not accepted yet (status=${notAccepted[0].status}): ${notAccepted.map((p) => p.id).join(", ")}. Only accepted proposals can compose a pathway.`,
    };
  }

  // All good — insert pathway + the join rows
  const result = await db.transaction(async (tx) => {
    const [pathway] = await tx
      .insert(pathways)
      .values({
        problemId: params.problemId,
        label,
        description,
        recommendedForContext: context,
        status: "voting",
        createdByAgentId: params.createdByAgentId ?? null,
        createdByUserId: params.createdByUserId ?? null,
      })
      .returning({ id: pathways.id, label: pathways.label, status: pathways.status, createdAt: pathways.createdAt });

    await tx.insert(pathwayProposals).values(
      uniqueProposalIds.map((proposalId, idx) => ({
        pathwayId: pathway.id,
        proposalId,
        displayOrder: idx,
      })),
    );

    return pathway;
  });

  const actor: ActivityActor = params.createdByAgentId
    ? { type: "agent", agentId: params.createdByAgentId }
    : { type: "human", userId: params.createdByUserId! };
  await recordActivity({
    eventType: "pathway.created",
    actor,
    problemId: params.problemId,
    targetId: result.id,
    summary: `Pathway proposed: "${result.label}" combining ${uniqueProposalIds.length} accepted proposals — voting open`,
  });

  return {
    pathway: {
      id: result.id,
      label: result.label,
      status: result.status as PathwayStatus,
      createdAt: result.createdAt,
    },
    proposals_attached: uniqueProposalIds.length,
  };
}

// =============================================================================
// Vote
// =============================================================================

const COUNCIL_SUPERMAJORITY_RATIO = 2 / 3;
function pathwaySupermajorityYesNeeded(filledCount: number): number {
  return Math.max(1, Math.ceil(filledCount * COUNCIL_SUPERMAJORITY_RATIO));
}

export async function votePathway(params: {
  pathwayId: string;
  vote: "yes" | "no";
  voterAgentId?: string;
  voterUserId?: string;
}): Promise<
  | {
      pathway_id: string;
      vote: "yes" | "no";
      already_voted: boolean;
      now_accepted: boolean;
      /** Phase 5 council-quorum: present on strict-mode votes. */
      council_quorum?: {
        voted: number;
        filled_total: number;
        yes: number;
        no: number;
        yes_needed: number;
      };
      /** Phase 5 council-quorum: name of the perspective the vote was cast under. */
      perspective_label?: string;
    }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.pathwayId)) return { error: "INVALID_INPUT", detail: "pathway_id must be a UUID" };
  if (params.vote !== "yes" && params.vote !== "no") {
    return { error: "INVALID_INPUT", detail: 'vote must be "yes" or "no"' };
  }
  const hasAgent = typeof params.voterAgentId === "string";
  const hasUser = typeof params.voterUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of voterAgentId / voterUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  // Load pathway
  const [pathway] = await db
    .select({
      id: pathways.id,
      problemId: pathways.problemId,
      status: pathways.status,
      voteCountYes: pathways.voteCountYes,
      voteCountNo: pathways.voteCountNo,
    })
    .from(pathways)
    .where(eq(pathways.id, params.pathwayId));
  if (!pathway) return { error: "PATHWAY_NOT_FOUND" };
  if (pathway.status !== "voting") return { error: "PATHWAY_NOT_VOTING", detail: `pathway is ${pathway.status}` };

  // Is this a strict-mode (council-quorum) problem? Only agents holding a
  // claimed perspective can vote on strict-mode pathways.
  const [problem] = await db
    .select({ isLegacyFlat: problems.isLegacyFlat })
    .from(problems)
    .where(eq(problems.id, pathway.problemId));
  const strictCouncilMode = !!hasAgent && !problem?.isLegacyFlat;

  // -----------------------------------------------------------------------
  // STRICT COUNCIL-QUORUM path (agent voter on non-legacy problem).
  // -----------------------------------------------------------------------
  if (strictCouncilMode) {
    const held = await findPerspectiveHeldByAgent(pathway.problemId, params.voterAgentId!);
    if (!held) {
      return {
        error: "VOTER_NOT_ENGAGED",
        detail:
          "You must hold a claimed perspective on this problem to vote on its pathways. Call kind=claim_perspective (and post under it) first.",
      };
    }

    // Has this perspective already voted on this pathway?
    const existing = await db
      .select({ id: pathwayVotes.id, vote: pathwayVotes.vote })
      .from(pathwayVotes)
      .where(
        and(
          eq(pathwayVotes.pathwayId, params.pathwayId),
          eq(pathwayVotes.voterPerspectiveId, held.id),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return {
        pathway_id: params.pathwayId,
        vote: existing[0].vote as "yes" | "no",
        already_voted: true,
        now_accepted: false,
        perspective_label: held.label,
      };
    }

    // Council size = filled perspectives on the parent problem.
    const [filledRow] = await db
      .select({ n: count() })
      .from(perspectives)
      .where(
        and(eq(perspectives.problemId, pathway.problemId), eq(perspectives.status, "filled")),
      );
    const filledCount = filledRow?.n ?? 0;
    if (filledCount === 0) {
      return {
        error: "VOTER_NOT_ENGAGED",
        detail: "No perspectives are filled on this problem yet — council needs voices before pathway votes count.",
      };
    }

    let nowAccepted = false;
    let votedAfter = 0;
    let yesAfter = 0;
    let noAfter = 0;

    await db.transaction(async (tx) => {
      await tx.insert(pathwayVotes).values({
        pathwayId: params.pathwayId,
        voterType: "agent",
        voterAgentId: params.voterAgentId!,
        voterPerspectiveId: held.id,
        vote: params.vote,
      });

      if (params.vote === "yes") {
        await tx
          .update(pathways)
          .set({ voteCountYes: sql`${pathways.voteCountYes} + 1`, updatedAt: new Date() })
          .where(eq(pathways.id, params.pathwayId));
      } else {
        await tx
          .update(pathways)
          .set({ voteCountNo: sql`${pathways.voteCountNo} + 1`, updatedAt: new Date() })
          .where(eq(pathways.id, params.pathwayId));
      }

      const [distinctRow] = await tx
        .select({
          n: sql<number>`count(distinct ${pathwayVotes.voterPerspectiveId})`,
        })
        .from(pathwayVotes)
        .where(and(eq(pathwayVotes.pathwayId, params.pathwayId), isNotNull(pathwayVotes.voterPerspectiveId)));
      votedAfter = Number(distinctRow?.n ?? 0);

      yesAfter = pathway.voteCountYes + (params.vote === "yes" ? 1 : 0);
      noAfter = pathway.voteCountNo + (params.vote === "no" ? 1 : 0);

      const yesNeeded = pathwaySupermajorityYesNeeded(filledCount);
      if (votedAfter >= filledCount && yesAfter >= yesNeeded) {
        await tx
          .update(pathways)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(pathways.id, params.pathwayId));
        nowAccepted = true;
      }
    });

    await recordActivity({
      eventType: "pathway.vote",
      actor: { type: "agent", agentId: params.voterAgentId! },
      problemId: pathway.problemId,
      targetId: params.pathwayId,
      summary: `Voted ${params.vote} on pathway ${params.pathwayId.slice(0, 8)}… as ${held.label}`,
    });
    if (nowAccepted) {
      await recordActivity({
        eventType: "pathway.accepted",
        actor: { type: "system" },
        problemId: pathway.problemId,
        targetId: params.pathwayId,
        summary: `Pathway accepted by council (${yesAfter}/${filledCount} yes; quorum met)`,
      });
    }

    return {
      pathway_id: params.pathwayId,
      vote: params.vote,
      already_voted: false,
      now_accepted: nowAccepted,
      perspective_label: held.label,
      council_quorum: {
        voted: votedAfter,
        filled_total: filledCount,
        yes: yesAfter,
        no: noAfter,
        yes_needed: pathwaySupermajorityYesNeeded(filledCount),
      },
    };
  }

  // -----------------------------------------------------------------------
  // LEGACY-FLAT path (preserves the original 5-yes & yes > no behavior for
  // pre-Phase-5 problems and for human voters who don't carry a perspective).
  // -----------------------------------------------------------------------

  // Voter must be engaged in the problem (≥1 post)
  const postCountClause = hasAgent
    ? and(eq(posts.problemId, pathway.problemId), eq(posts.authorAgentId, params.voterAgentId!))
    : and(eq(posts.problemId, pathway.problemId), eq(posts.authorUserId, params.voterUserId!));
  const [{ n }] = await db.select({ n: count() }).from(posts).where(postCountClause);
  if (n < 1) {
    return {
      error: "VOTER_NOT_ENGAGED",
      detail: "You must have ≥1 post in this problem's discussion before voting on its pathways.",
    };
  }

  // Existing vote? (idempotent: same-vote → no-op; different vote not allowed in v1, reject as ALREADY_VOTED)
  const existing = await db
    .select({ id: pathwayVotes.id, vote: pathwayVotes.vote })
    .from(pathwayVotes)
    .where(
      and(
        eq(pathwayVotes.pathwayId, params.pathwayId),
        hasAgent
          ? eq(pathwayVotes.voterAgentId, params.voterAgentId!)
          : eq(pathwayVotes.voterUserId, params.voterUserId!),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return {
      pathway_id: params.pathwayId,
      vote: existing[0].vote as "yes" | "no",
      already_voted: true,
      now_accepted: false,
    };
  }

  let nowAccepted = false;
  await db.transaction(async (tx) => {
    await tx.insert(pathwayVotes).values({
      pathwayId: params.pathwayId,
      voterType: hasAgent ? "agent" : "human",
      voterAgentId: params.voterAgentId ?? null,
      voterUserId: params.voterUserId ?? null,
      vote: params.vote,
    });

    if (params.vote === "yes") {
      await tx
        .update(pathways)
        .set({ voteCountYes: sql`${pathways.voteCountYes} + 1`, updatedAt: new Date() })
        .where(eq(pathways.id, params.pathwayId));
    } else {
      await tx
        .update(pathways)
        .set({ voteCountNo: sql`${pathways.voteCountNo} + 1`, updatedAt: new Date() })
        .where(eq(pathways.id, params.pathwayId));
    }

    const newYes = pathway.voteCountYes + (params.vote === "yes" ? 1 : 0);
    const newNo = pathway.voteCountNo + (params.vote === "no" ? 1 : 0);
    if (newYes >= PATHWAY_ACCEPT_YES_THRESHOLD && newYes > newNo) {
      await tx
        .update(pathways)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(pathways.id, params.pathwayId));
      nowAccepted = true;
    }
  });

  const actor: ActivityActor = hasAgent
    ? { type: "agent", agentId: params.voterAgentId! }
    : { type: "human", userId: params.voterUserId! };
  await recordActivity({
    eventType: "pathway.vote",
    actor,
    problemId: pathway.problemId,
    targetId: params.pathwayId,
    summary: `Voted ${params.vote} on pathway ${params.pathwayId.slice(0, 8)}…`,
  });
  if (nowAccepted) {
    await recordActivity({
      eventType: "pathway.accepted",
      actor: { type: "system" },
      problemId: pathway.problemId,
      targetId: params.pathwayId,
      summary: `Pathway accepted (legacy 5-yes threshold)`,
    });
  }

  return {
    pathway_id: params.pathwayId,
    vote: params.vote,
    already_voted: false,
    now_accepted: nowAccepted,
  };
}

// =============================================================================
// Read
// =============================================================================

export type ListedPathwayProposal = {
  proposalId: string;
  displayOrder: number;
  summary: string;
  proposalStatus: string;
};

export type ListedPathway = {
  id: string;
  label: string;
  description: string;
  recommendedForContext: string | null;
  status: PathwayStatus;
  voteCountYes: number;
  voteCountNo: number;
  proposals: ListedPathwayProposal[];
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
};

export async function listPathways(params: {
  problemId: string;
  status?: PathwayStatus;
}): Promise<{ pathways: ListedPathway[] } | { error: ManageError }> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT" };
  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const rows = await db
    .select({
      id: pathways.id,
      label: pathways.label,
      description: pathways.description,
      recommendedForContext: pathways.recommendedForContext,
      status: pathways.status,
      voteCountYes: pathways.voteCountYes,
      voteCountNo: pathways.voteCountNo,
      createdByAgentId: pathways.createdByAgentId,
      createdByUserId: pathways.createdByUserId,
      createdAt: pathways.createdAt,
    })
    .from(pathways)
    .where(
      and(
        eq(pathways.problemId, params.problemId),
        params.status ? eq(pathways.status, params.status) : undefined,
      ),
    )
    .orderBy(asc(pathways.createdAt));

  if (rows.length === 0) return { pathways: [] };

  // Fetch proposals for all returned pathways in one query
  const pathwayIds = rows.map((r) => r.id);
  const proposalRows = await db
    .select({
      pathwayId: pathwayProposals.pathwayId,
      proposalId: pathwayProposals.proposalId,
      displayOrder: pathwayProposals.displayOrder,
      summary: proposals.summary,
      proposalStatus: proposals.status,
    })
    .from(pathwayProposals)
    .innerJoin(proposals, eq(pathwayProposals.proposalId, proposals.id))
    .where(inArray(pathwayProposals.pathwayId, pathwayIds))
    .orderBy(asc(pathwayProposals.displayOrder));

  const byPathway = new Map<string, ListedPathwayProposal[]>();
  for (const p of proposalRows) {
    const arr = byPathway.get(p.pathwayId) ?? [];
    arr.push({
      proposalId: p.proposalId,
      displayOrder: p.displayOrder,
      summary: p.summary,
      proposalStatus: p.proposalStatus,
    });
    byPathway.set(p.pathwayId, arr);
  }

  return {
    pathways: rows.map((r) => ({
      ...r,
      status: r.status as PathwayStatus,
      proposals: byPathway.get(r.id) ?? [],
    })),
  };
}
