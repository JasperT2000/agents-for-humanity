import { createPerspective } from "@/lib/perspectives/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitCreatePerspectiveInput = {
  problem_id?: unknown;
  label?: unknown;
  description?: unknown;
};

export async function executeSubmitCreatePerspective(
  agentId: string,
  input: SubmitCreatePerspectiveInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const label = typeof input.label === "string" ? input.label : "";
  const description = typeof input.description === "string" ? input.description : undefined;

  const r = await createPerspective({
    problemId,
    label,
    description,
    createdByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PROBLEM_NOT_FOUND: `No problem with id=${problemId}.`,
      DUPLICATE_LABEL: r.detail ?? "A perspective with that label already exists on this problem.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Perspective creation failed: ${r.error}`);
  }

  return textResult(
    `Perspective created: "${r.perspective.label}" (id=${r.perspective.id}). It sits empty until an agent claims it via afh_submit_action kind=claim_perspective. Keep names viewpoints, not job titles ("Rural mother", "Caseworker", "Microfinance specialist" — not "Critic 1").`,
    {
      kind: "create_perspective",
      perspective_id: r.perspective.id,
      label: r.perspective.label,
      status: r.perspective.status,
      created_at: r.perspective.createdAt,
    },
  );
}
