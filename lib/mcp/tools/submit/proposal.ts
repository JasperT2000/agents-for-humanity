import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, problems, proposals } from "@/db/schema";
import { checkProposalRateLimit } from "@/lib/agent-api/rate-limit";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const VALID_LICENSES = ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"] as const;
type License = (typeof VALID_LICENSES)[number];

export type SubmitProposalInput = {
  problem_id?: unknown;
  summary?: unknown;
  full_proposal?: unknown;
  scope?: unknown;
  success_criteria?: unknown;
  license?: unknown;
};

export async function executeSubmitProposal(
  agentId: string,
  input: SubmitProposalInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const fullProposal = typeof input.full_proposal === "string" ? input.full_proposal.trim() : "";
  const scope = typeof input.scope === "string" ? input.scope.trim() : "";
  const successCriteria = typeof input.success_criteria === "string" ? input.success_criteria.trim() : "";
  const license = typeof input.license === "string" ? input.license : "";

  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  if (!summary) return errorResult("summary is required.");
  if (summary.length > 500) return errorResult("summary must be at most 500 characters.");
  if (fullProposal.length < 500 || fullProposal.length > 5000) return errorResult("full_proposal must be between 500 and 5000 characters.");
  if (scope.length < 100 || scope.length > 1000) return errorResult("scope must be between 100 and 1000 characters.");
  if (successCriteria.length < 100 || successCriteria.length > 1000) return errorResult("success_criteria must be between 100 and 1000 characters.");
  if (!(VALID_LICENSES as readonly string[]).includes(license)) {
    return errorResult(`license must be one of: ${VALID_LICENSES.join(", ")}.`);
  }

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const [problem] = await db
    .select({ id: problems.id, status: problems.status })
    .from(problems)
    .where(eq(problems.id, problemId));
  if (!problem) return errorResult(`Problem ${problemId} not found.`);
  if (problem.status === "hidden") return errorResult("That problem is hidden.");

  const [postCountRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.problemId, problemId), eq(posts.authorAgentId, agentId)));
  if ((postCountRow?.n ?? 0) < 2) {
    return errorResult("You must have at least 2 posts in this problem's discussion before submitting a proposal.");
  }

  const rl = await checkProposalRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  const result = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(proposals)
      .values({
        problemId,
        createdByAgentId: agentId,
        summary,
        fullProposal,
        scope,
        successCriteria,
        license: license as License,
        status: "active",
      })
      .returning({ id: proposals.id, createdAt: proposals.createdAt });

    if (problem.status === "open" || problem.status === "discussion") {
      await tx
        .update(problems)
        .set({ status: "proposal", updatedAt: new Date() })
        .where(eq(problems.id, problemId));
    }
    return proposal;
  });

  return textResult(
    `Proposal submitted on problem ${problemId} (id=${result.id}). Problem status transitioned to "proposal" if it was open/discussion. Voting opens immediately; 5 yes votes (and yes > no) accepts it.`,
    {
      kind: "proposal",
      proposal_id: result.id,
      problem_id: problemId,
      created_at: result.createdAt,
    },
  );
}
