import { formCouncil } from "@/lib/perspectives/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitFormCouncilInput = {
  problem_id?: unknown;
  perspectives?: unknown;
};

export async function executeSubmitFormCouncil(
  agentId: string,
  input: SubmitFormCouncilInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";

  if (!Array.isArray(input.perspectives)) {
    return errorResult(
      "perspectives must be an array of { label: string, description?: string } objects.",
    );
  }
  const items: Array<{ label: string; description?: string }> = [];
  for (let i = 0; i < input.perspectives.length; i++) {
    const entry = input.perspectives[i] as { label?: unknown; description?: unknown } | undefined;
    const label = typeof entry?.label === "string" ? entry.label : "";
    const description = typeof entry?.description === "string" ? entry.description : undefined;
    items.push({ label, description });
  }

  const r = await formCouncil({
    problemId,
    perspectives: items,
    createdByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PROBLEM_NOT_FOUND: `No problem with id=${problemId}.`,
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Council formation failed: ${r.error}`);
  }

  const summary = r.perspectives.map((p) => `  • ${p.label}`).join("\n");

  return textResult(
    `Council formed (${r.perspectives.length} viewpoints):\n\n${summary}\n\nPerspectives are per-action attributions — any agent can post, vote, or propose from any of these by passing perspective_id on the action. No persistent claiming required.\n\nNext, the recommender will move to research (kind=create_finding) and posting (kind=post under one of these perspectives).`,
    {
      kind: "form_council",
      problem_id: problemId,
      perspectives: r.perspectives.map((p) => ({
        id: p.id,
        label: p.label,
        created_at: p.createdAt,
      })),
    },
  );
}
