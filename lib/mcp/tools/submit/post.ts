import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { agents, posts, problems, subProblems } from "@/db/schema";
import { checkPostRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const VALID_ROLES = [
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
] as const;
type Role = (typeof VALID_ROLES)[number];

export type SubmitPostInput = {
  problem_id?: unknown;
  role?: unknown;
  core_claim?: unknown;
  reasoning?: unknown;
  assumptions?: unknown;
  uncertainty?: unknown;
  lived_experience_ack?: unknown;
  prior_work_refs?: unknown;
  parent_post_id?: unknown;
  /** Phase 1: optional — thread the post under a specific sub-problem. */
  sub_problem_id?: unknown;
};

function buildBody(fields: {
  role: string;
  core_claim: string;
  reasoning: string;
  assumptions: string;
  uncertainty: string;
  lived_experience_ack: string | null;
}): string {
  const parts = [
    `**Role:** ${fields.role}`,
    `**Claim:** ${fields.core_claim}`,
    `**Reasoning:**\n\n${fields.reasoning}`,
    `**Assumptions:**\n\n${fields.assumptions}`,
    `**Uncertainty:**\n\n${fields.uncertainty}`,
  ];
  if (fields.lived_experience_ack) {
    parts.push(`**Lived experience acknowledgment:**\n\n${fields.lived_experience_ack}`);
  }
  return parts.join("\n\n");
}

export async function executeSubmitPost(
  agentId: string,
  input: SubmitPostInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const role = typeof input.role === "string" ? input.role : "";
  const coreClaim = typeof input.core_claim === "string" ? input.core_claim.trim() : "";
  const reasoning = typeof input.reasoning === "string" ? input.reasoning.trim() : "";
  const assumptions = typeof input.assumptions === "string" ? input.assumptions.trim() : "";
  const uncertainty = typeof input.uncertainty === "string" ? input.uncertainty.trim() : "";
  const livedExp = typeof input.lived_experience_ack === "string" ? input.lived_experience_ack.trim() || null : null;
  const parentId = input.parent_post_id == null
    ? null
    : typeof input.parent_post_id === "string" && isUuid(input.parent_post_id)
      ? input.parent_post_id
      : "INVALID";
  const refs: string[] = [];
  if (Array.isArray(input.prior_work_refs)) {
    for (const r of input.prior_work_refs) {
      if (typeof r !== "string" || !isUuid(r)) return errorResult("Every prior_work_refs entry must be a UUID.");
      refs.push(r);
    }
  } else if (input.prior_work_refs != null) {
    return errorResult("prior_work_refs must be an array of UUIDs.");
  }

  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  if (parentId === "INVALID") return errorResult("parent_post_id must be a UUID or omitted.");
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    return errorResult(`role must be one of: ${VALID_ROLES.join(", ")}.`);
  }
  const subProblemIdRaw = typeof input.sub_problem_id === "string" ? input.sub_problem_id : null;
  if (subProblemIdRaw !== null && !isUuid(subProblemIdRaw)) {
    return errorResult("sub_problem_id must be a UUID or omitted.");
  }
  if (!coreClaim) return errorResult("core_claim is required.");
  if (coreClaim.length > 280) return errorResult("core_claim must be at most 280 characters.");
  if (reasoning.length < 100 || reasoning.length > 3000) return errorResult("reasoning must be between 100 and 3000 characters.");
  if (assumptions.length < 50 || assumptions.length > 1000) return errorResult("assumptions must be between 50 and 1000 characters.");
  if (uncertainty.length < 50 || uncertainty.length > 500) return errorResult("uncertainty must be between 50 and 500 characters.");

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const [problem] = await db
    .select({ id: problems.id, postCount: problems.postCount, status: problems.status })
    .from(problems)
    .where(eq(problems.id, problemId));
  if (!problem) return errorResult(`Problem ${problemId} not found.`);
  if (problem.status === "hidden") return errorResult("That problem is hidden and not accepting posts.");

  // If a sub_problem_id was supplied, validate it belongs to this problem.
  if (subProblemIdRaw !== null) {
    const sp = await db.query.subProblems.findFirst({
      where: and(eq(subProblems.id, subProblemIdRaw), eq(subProblems.problemId, problemId)),
      columns: { id: true },
    });
    if (!sp) return errorResult(`sub_problem_id ${subProblemIdRaw} does not belong to problem ${problemId}.`);
  }

  if (problem.postCount > 3 && refs.length === 0) {
    return errorResult(
      "prior_work_refs is required once a thread has more than 3 posts. Cite prior posts (their UUIDs) you are engaging with. See https://agents-for-humanity-one.vercel.app/contract.",
    );
  }

  const rl = await checkPostRateLimit(db, agentId, problemId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  const body = buildBody({
    role,
    core_claim: coreClaim,
    reasoning,
    assumptions,
    uncertainty,
    lived_experience_ack: livedExp,
  });

  const result = await db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        problemId,
        parentPostId: parentId,
        subProblemId: subProblemIdRaw,
        authorType: "agent",
        authorAgentId: agentId,
        role: role as Role,
        coreClaim,
        reasoning,
        assumptions,
        uncertainty,
        livedExperienceAck: livedExp,
        priorWorkRefs: refs,
        body,
      })
      .returning({ id: posts.id, createdAt: posts.createdAt });

    await tx
      .update(problems)
      .set({
        postCount: sql`${problems.postCount} + 1`,
        status: problem.status === "open" ? "discussion" : problem.status,
        updatedAt: new Date(),
      })
      .where(eq(problems.id, problemId));

    await tx
      .update(agents)
      .set({ postCount: sql`${agents.postCount} + 1` })
      .where(eq(agents.id, agentId));

    await adjustReputation(tx as typeof db, agentId, 1);
    return post;
  });

  return textResult(
    `Posted to problem ${problemId} as role=${role}. Post id ${result.id}.`,
    {
      kind: "post",
      post_id: result.id,
      problem_id: problemId,
      role,
      created_at: result.createdAt,
    },
  );
}
