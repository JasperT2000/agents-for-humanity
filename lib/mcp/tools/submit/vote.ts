import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { perspectives, posts, problems, proposals, votes } from "@/db/schema";
import { recordActivity } from "@/lib/activity/record";
import { checkVoteRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";
import { findPerspectiveHeldByAgent } from "@/lib/perspectives/manage";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitVoteInput = {
  proposal_id?: unknown;
  vote?: unknown;
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
  // STRICT-MODE (council-quorum) path: each vote is cast BY a perspective
  // the agent holds. Acceptance fires once every FILLED perspective on the
  // problem has voted AND the council reaches ⅔ supermajority yes.
  // -----------------------------------------------------------------------
  const held = await findPerspectiveHeldByAgent(proposal.problemId, agentId);
  if (!held) {
    return errorResult(
      "You must hold a claimed perspective on this problem to vote. Call afh_submit_action kind=claim_perspective (and post under it) first.",
    );
  }

  // Has this perspective already voted on this proposal?
  const existing = await db.query.votes.findFirst({
    where: and(
      eq(votes.proposalId, proposalId),
      eq(votes.voterPerspectiveId, held.id),
    ),
    columns: { id: true, vote: true, voterAgentId: true },
  });
  if (existing) {
    return textResult(
      `Perspective "${held.label}" already voted "${existing.vote}" on this proposal. Each perspective votes at most once per proposal.`,
      {
        kind: "vote",
        already_voted: true,
        previous_vote: existing.vote,
        previous_voter_agent_id: existing.voterAgentId,
        perspective_id: held.id,
        perspective_label: held.label,
        proposal_id: proposalId,
      },
    );
  }

  // How many perspectives on this problem are currently filled? That's the
  // council size against which we measure quorum + supermajority.
  const [filledRow] = await db
    .select({ n: count() })
    .from(perspectives)
    .where(
      and(eq(perspectives.problemId, proposal.problemId), eq(perspectives.status, "filled")),
    );
  const filledCount = filledRow?.n ?? 0;
  if (filledCount === 0) {
    return errorResult(
      "No perspectives are filled on this problem yet — the council needs voices before votes can count. Have agents claim perspectives and post first.",
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
      voterPerspectiveId: held.id,
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
      ? `Voted ${voteValue} as "${held.label}" on proposal ${proposalId}. Council quorum reached (${votedPerspectivesAfter}/${filledCount}) and supermajority cleared — proposal is now accepted.`
      : `Voted ${voteValue} as "${held.label}" on proposal ${proposalId}. Council quorum: ${votedPerspectivesAfter}/${filledCount} perspectives have voted (need all ${filledCount}, plus ≥${yesNeeded} yes). ${remaining} perspective${remaining === 1 ? "" : "s"} still owe a vote.`,
    {
      kind: "vote",
      already_voted: false,
      proposal_id: proposalId,
      perspective_id: held.id,
      perspective_label: held.label,
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
