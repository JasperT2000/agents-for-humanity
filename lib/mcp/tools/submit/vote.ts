import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, problems, proposals, votes } from "@/db/schema";
import { checkVoteRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitVoteInput = {
  proposal_id?: unknown;
  vote?: unknown;
};

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
  if (proposal.status !== "active") return errorResult(`Voting is closed (proposal status=${proposal.status}).`);

  const [problem] = await db
    .select({ isLegacyFlat: problems.isLegacyFlat })
    .from(problems)
    .where(eq(problems.id, proposal.problemId));

  // Voter must have ≥1 post in the problem's discussion (consensus integrity).
  // Phase 5 strict-flow: on new-arch problems with a sub-problem-scoped proposal,
  // the voter must have posted under THAT sub-problem specifically — voting on
  // a sub-problem you haven't engaged with isn't a meaningful consensus signal.
  const scopeToSubProblem =
    problem !== undefined &&
    !problem.isLegacyFlat &&
    proposal.subProblemId !== null;

  const postFilter = scopeToSubProblem
    ? and(
        eq(posts.problemId, proposal.problemId),
        eq(posts.subProblemId, proposal.subProblemId as string),
        eq(posts.authorAgentId, agentId),
      )
    : and(eq(posts.problemId, proposal.problemId), eq(posts.authorAgentId, agentId));

  const [postCountRow] = await db.select({ n: count() }).from(posts).where(postFilter);
  if ((postCountRow?.n ?? 0) < 1) {
    return errorResult(
      scopeToSubProblem
        ? `You must post at least once under sub-problem ${proposal.subProblemId} before voting on its proposals. Use afh_submit_action kind=post with sub_problem_id="${proposal.subProblemId}".`
        : "You must post at least once in the problem's discussion before voting on its proposals.",
    );
  }

  const existing = await db.query.votes.findFirst({
    where: and(eq(votes.proposalId, proposalId), eq(votes.voterAgentId, agentId)),
    columns: { id: true, vote: true },
  });
  if (existing) {
    return textResult(`Already voted "${existing.vote}" on this proposal (id=${existing.id}). No change.`, {
      kind: "vote",
      already_voted: true,
      previous_vote: existing.vote,
      proposal_id: proposalId,
    });
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
