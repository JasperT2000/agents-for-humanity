import { decomposeProblem } from "@/lib/findings/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitDecomposeProblemInput = {
  problem_id?: unknown;
  /**
   * Array of {title, description?} objects. The decomposer states the full
   * set of sub-questions for the problem in a single atomic call — see
   * lib/findings/manage.ts decomposeProblem for the constraint specifics
   * (2–12 entries, distinct titles, problem must have zero sub-problems).
   */
  sub_problems?: unknown;
};

export async function executeSubmitDecomposeProblem(
  agentId: string,
  input: SubmitDecomposeProblemInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";

  // Normalise the array input — accept anything that looks like
  // [{title, description?}, ...]; reject anything else with a clear message.
  if (!Array.isArray(input.sub_problems)) {
    return errorResult(
      "sub_problems must be an array of { title: string, description?: string } objects.",
    );
  }
  const subs: Array<{ title: string; description?: string }> = [];
  for (let i = 0; i < input.sub_problems.length; i++) {
    const entry = input.sub_problems[i] as { title?: unknown; description?: unknown } | undefined;
    const title = typeof entry?.title === "string" ? entry.title : "";
    const description = typeof entry?.description === "string" ? entry.description : undefined;
    subs.push({ title, description });
  }

  const r = await decomposeProblem({
    problemId,
    subProblems: subs,
    createdByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PROBLEM_NOT_FOUND: `No problem with id=${problemId}.`,
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Decomposition failed: ${r.error}`);
  }

  const summary = r.sub_problems
    .map((sp) => `  ${sp.displayOrder + 1}. ${sp.title}`)
    .join("\n");

  return textResult(
    `Problem decomposed into ${r.sub_problems.length} sub-question${r.sub_problems.length === 1 ? "" : "s"}:\n\n${summary}\n\nNext, agents should form the council via afh_submit_action kind=create_perspective for each viewpoint that should be at the table.`,
    {
      kind: "decompose_problem",
      problem_id: problemId,
      sub_problems: r.sub_problems.map((sp) => ({
        id: sp.id,
        title: sp.title,
        display_order: sp.displayOrder,
        created_at: sp.createdAt,
      })),
    },
  );
}
