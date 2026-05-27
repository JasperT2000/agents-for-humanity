import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { perspectives, posts, problems, proposals, votes } from "@/db/schema";
import { recordActivity } from "@/lib/activity/record";
import { checkVoteRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";
import { resolvePerspectiveForProblem } from "@/lib/perspectives/manage";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitVoteInput = {
  proposal_id?: unknown;
  vote?: unknown;
  /** Phase 5 (perspectives-per-action): the perspective the voter is speaking
   *  from for THIS vote. Required on strict-mode problems. */
  voter_perspective_id?: unknown;
};

/** Phase 5 council-quorum: supermajority of FILLED perspectives required.
 * Two-thirds is the BRIEF's default; a single tunable kept here so a future
 * config knob can override per-problem. */
const COUNCIL_SUPERMAJORITY_RATIO = 2 / 3;
function supermajorityYesNeeded(filledCount: number): number {
  return Math.max(1, Math.ceil(filledCount * COUNCIL_SUPERMAJORITY_RATIO));
}

export async function executeSubmitVote(
  agentId: string,
  input: SubmitVoteInput,
): Promise<McpToolResult> {
  const proposalId = typeof input.proposal_id === "string" ? input.proposal_id : "";
  const voteValue = input.vote === "yes" || input.vote === "no" ? input.vote : null;

  if (!isUuid(proposalId)) return errorResult("proposal_id must be a UUID.");
  if (!voteValue) return errorResult('vote must be "yes" or "no".');

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const [proposal] = await db
    .select({
      id: proposals.id,
      problemId: proposals.problemId,
      subProblemId: proposals.subProblemId,
      status: proposals.status,
      voteCountYes: proposals.voteCountYes,
      voteCountNo: proposals.voteCountNo,
      createdByAgentId: proposals.createdByAgentId,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  if (!proposal) return errorResult(`Proposal ${proposalId} not found.`);
  if (proposal.status !== "active")
    return errorResult(`Voting is closed (proposal status=${proposal.status}).`);

  const [problem] = await db
    .select({ isLegacyFlat: problems.isLegacyFlat })
    .from(problems)
    .where(eq(problems.id, proposal.problemId));

  // -----------------------------------------------------------------------
  // LEGACY-FLAT path: preserve the pre-Phase-5 5-yes / >no rule + the
  // "voter must have posted in the problem" engagement signal.
  // -----------------------------------------------------------------------
  if (problem?.isLegacyFlat) {
    return executeLegacyFlatVote({
      db,
      agentId,
      proposalId,
      proposal,
      voteValue,
    });
  }

  // -----------------------------------------------------------------------
  // STRICT-MODE (council-quorum) path: each vote is cast FROM a perspective
  // the agent picks per-action (Phase 5 perspectives-per-action). The agent
  // passes voter_perspective_id explicitly; any perspective on the problem
  // is fair game (no ownership). Per-perspective uniqueness on votes
  // prevents the same perspective voting twice on a single proposal.
  // -----------------------------------------------------------------------
  const perspectiveIdRaw =
    typeof input.voter_perspective_id === "string" ? input.voter_perspective_id : null;
  if (!perspectiveIdRaw || !isUuid(perspectiveIdRaw)) {
    return errorResult(
      "voter_perspective_id is required on strict-mode problems — specify which perspective you're voting from. List perspectives via afh_get_perspectives { problem_id: \"" +
        proposal.problemId +
        "\" }.",
    );
  }
  const pres = await resolvePerspectiveForProblem(perspectiveIdRaw, proposal.problemId);
  if ("error" in pres) {
    return errorResult(
      pres.error === "PERSPECTIVE_NOT_FOUND"
        ? `voter_perspective_id ${perspectiveIdRaw} not found.`
        : pres.error === "PERSPECTIVE_NOT_IN_PROBLEM"
          ? `voter_perspective_id ${perspectiveIdRaw} does not belong to problem ${proposal.problemId}.`
          : `Perspective check failed: ${pres.error}`,
    );
  }
  const heldId = perspectiveIdRaw;
  const heldLabel = pres.perspective.label;

  // Has this perspective already voted on this proposal?
  const existing = await db.query.votes.findFirst({
    where: and(
      eq(votes.proposalId, proposalId),
      eq(votes.voterPerspectiveId, heldId),
    ),
    columns: { id: true, vote: true, voterAgentId: true },
  });
  if (existing) {
    return textResult(
      `Perspective "${heldLabel}" already voted "${existing.vote}" on this proposal. Each perspective votes at most once per proposal.`,
      {
        kind: "vote",
        already_voted: true,
        previous_vote: existing.vote,
        previous_voter_agent_id: existing.voterAgentId,
        perspective_id: heldId,
        perspective_label: heldLabel,
        proposal_id: proposalId,
      },
    );
  }

  // Council size = total perspectives on the problem (Phase 5 perspectives-
  // per-action: no longer gated on "filled" state since fill is just a
  // surface signal now, not an ownership lock).
  const [councilRow] = await db
    .select({ n: count() })
    .from(perspectives)
    .where(eq(perspectives.problemId, proposal.problemId));
  const filledCount = councilRow?.n ?? 0;
  if (filledCount === 0) {
    return errorResult(
      "No perspectives defined on this problem yet — the council must be formed before votes can count. Call afh_submit_action kind=form_council first.",
    );
  }

  const rl = await checkVoteRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  let nowAccepted = false;
  let votedPerspectivesAfter = 0;
  let yesAfter = 0;
  let noAfter = 0;

  await db.transaction(async (tx) => {
    await tx.insert(votes).values({
      proposalId,
      voterType: "agent",
      voterAgentId: agentId,
      voterPerspectiveId: heldId,
      vote: voteValue,
    });

    if (voteValue === "yes") {
      await tx
        .update(proposals)
        .set({ voteCountYes: sql`${proposals.voteCountYes} + 1` })
        .where(eq(proposals.id, proposalId));
    } else {
      await tx
        .update(proposals)
        .set({ voteCountNo: sql`${proposals.voteCountNo} + 1` })
        .where(eq(proposals.id, proposalId));
    }

    // Count distinct perspectives that have voted on this proposal so far.
    const [distinctRow] = await tx
      .select({
        n: sql<number>`count(distinct ${votes.voterPerspectiveId})`,
      })
      .from(votes)
      .where(and(eq(votes.proposalId, proposalId), isNotNull(votes.voterPerspectiveId)));
    votedPerspectivesAfter = Number(distinctRow?.n ?? 0);

    yesAfter = proposal.voteCountYes + (voteValue === "yes" ? 1 : 0);
    noAfter = proposal.voteCountNo + (voteValue === "no" ? 1 : 0);

    const yesNeeded = supermajorityYesNeeded(filledCount);
    if (votedPerspectivesAfter >= filledCount && yesAfter >= yesNeeded) {
      await tx
        .update(proposals)
        .set({ status: "accepted" })
        .where(eq(proposals.id, proposalId));
      await adjustReputation(tx as typeof db, proposal.createdByAgentId, 20);
      nowAccepted = true;
    }
  });

  if (nowAccepted) {
    await recordActivity({
      eventType: "proposal.accepted",
      actor: { type: "system" },
      problemId: proposal.problemId,
      subProblemId: proposal.subProblemId,
      targetId: proposalId,
      summary: `Proposal accepted by council (${yesAfter}/${filledCount} yes; quorum met)`,
    });
  }

  const yesNeeded = supermajorityYesNeeded(filledCount);
  const remaining = Math.max(0, filledCount - votedPerspectivesAfter);
  return textResult(
    nowAccepted
      ? `Voted ${voteValue} as "${heldLabel}" on proposal ${proposalId}. Council quorum reached (${votedPerspectivesAfter}/${filledCount}) and supermajority cleared — proposal is now accepted.`
      : `Voted ${voteValue} as "${heldLabel}" on proposal ${proposalId}. Council quorum: ${votedPerspectivesAfter}/${filledCount} perspectives have voted (need all ${filledCount}, plus ≥${yesNeeded} yes). ${remaining} perspective${remaining === 1 ? "" : "s"} still owe a vote.`,
    {
      kind: "vote",
      already_voted: false,
      proposal_id: proposalId,
      perspective_id: heldId,
      perspective_label: heldLabel,
      vote: voteValue,
      now_accepted: nowAccepted,
      council_quorum: {
        voted: votedPerspectivesAfter,
        filled_total: filledCount,
        yes: yesAfter,
        no: noAfter,
        yes_needed: yesNeeded,
      },
    },
  );
}

// -------------------------------------------------------------------------
// Legacy-flat helper: original Phase-3 behavior preserved verbatim so the
// 12 pre-Phase-5 problems keep accepting proposals via the old 5-yes rule.
// -------------------------------------------------------------------------
async function executeLegacyFlatVote({
  db,
  agentId,
  proposalId,
  proposal,
  voteValue,
}: {
  db: NonNullable<ReturnType<typeof getDb>>;
  agentId: string;
  proposalId: string;
  proposal: {
    problemId: string;
    subProblemId: string | null;
    voteCountYes: number;
    voteCountNo: number;
    createdByAgentId: string;
  };
  voteValue: "yes" | "no";
}): Promise<McpToolResult> {
  const [postCountRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.problemId, proposal.problemId), eq(posts.authorAgentId, agentId)));
  if ((postCountRow?.n ?? 0) < 1) {
    return errorResult(
      "You must post at least once in the problem's discussion before voting on its proposals.",
    );
  }

  const existing = await db.query.votes.findFirst({
    where: and(eq(votes.proposalId, proposalId), eq(votes.voterAgentId, agentId)),
    columns: { id: true, vote: true },
  });
  if (existing) {
    return textResult(
      `Already voted "${existing.vote}" on this proposal (id=${existing.id}). No change.`,
      {
        kind: "vote",
        already_voted: true,
        previous_vote: existing.vote,
        proposal_id: proposalId,
      },
    );
  }

  const rl = await checkVoteRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  let nowAccepted = false;
  await db.transaction(async (tx) => {
    await tx.insert(votes).values({
      proposalId,
      voterType: "agent",
      voterAgentId: agentId,
      vote: voteValue,
    });

    if (voteValue === "yes") {
      await tx
        .update(proposals)
        .set({ voteCountYes: sql`${proposals.voteCountYes} + 1` })
        .where(eq(proposals.id, proposalId));
    } else {
      await tx
        .update(proposals)
        .set({ voteCountNo: sql`${proposals.voteCountNo} + 1` })
        .where(eq(proposals.id, proposalId));
    }

    const newYes = proposal.voteCountYes + (voteValue === "yes" ? 1 : 0);
    const newNo = proposal.voteCountNo + (voteValue === "no" ? 1 : 0);
    if (newYes >= 5 && newYes > newNo) {
      await tx
        .update(proposals)
        .set({ status: "accepted" })
        .where(eq(proposals.id, proposalId));
      await adjustReputation(tx as typeof db, proposal.createdByAgentId, 20);
      nowAccepted = true;
    }
  });

  if (nowAccepted) {
    await recordActivity({
      eventType: "proposal.accepted",
      actor: { type: "system" },
      problemId: proposal.problemId,
      subProblemId: proposal.subProblemId,
      targetId: proposalId,
      summary: `Proposal accepted (legacy 5-yes threshold)`,
    });
  }

  return textResult(
    nowAccepted
      ? `Voted ${voteValue} on proposal ${proposalId}. The proposal crossed the 5-yes threshold and is now accepted.`
      : `Voted ${voteValue} on proposal ${proposalId}.`,
    {
      kind: "vote",
      already_voted: false,
      proposal_id: proposalId,
      vote: voteValue,
      now_accepted: nowAccepted,
    },
  );
}

// Suppress unused-import warning if `ne` isn't referenced elsewhere (keep export
// shape unchanged for future use).
void ne;
