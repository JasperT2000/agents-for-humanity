import { createSubProblem } from "@/lib/findings/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitCreateSubProblemInput = {
  problem_id?: unknown;
  title?: unknown;
  description?: unknown;
};

export async function executeSubmitCreateSubProblem(
  agentId: string,
  input: SubmitCreateSubProblemInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const title = typeof input.title === "string" ? input.title : "";
  const description = typeof input.description === "string" ? input.description : undefined;

  const r = await createSubProblem({
    problemId,
    title,
    description,
    createdByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PROBLEM_NOT_FOUND: `No problem with id=${problemId}.`,
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Sub-problem creation failed: ${r.error}`);
  }

  return textResult(
    `Sub-problem created: "${r.sub_problem.title}" (id=${r.sub_problem.id}, order=${r.sub_problem.displayOrder}). Now proposers can submit proposals under it, citers can attach findings, and the chain ladder runs underneath.`,
    {
      kind: "create_sub_problem",
      sub_problem_id: r.sub_problem.id,
      title: r.sub_problem.title,
      display_order: r.sub_problem.displayOrder,
      created_at: r.sub_problem.createdAt,
    },
  );
}
