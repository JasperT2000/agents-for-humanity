import { createPathway } from "@/lib/pathways/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitCreatePathwayInput = {
  problem_id?: unknown;
  label?: unknown;
  description?: unknown;
  recommended_for_context?: unknown;
  proposal_ids?: unknown;
};

export async function executeSubmitCreatePathway(
  agentId: string,
  input: SubmitCreatePathwayInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const label = typeof input.label === "string" ? input.label : "";
  const description = typeof input.description === "string" ? input.description : "";
  const recommendedForContext = typeof input.recommended_for_context === "string" ? input.recommended_for_context : undefined;

  const proposalIds: string[] = [];
  if (Array.isArray(input.proposal_ids)) {
    for (const id of input.proposal_ids) {
      if (typeof id !== "string") return errorResult("every proposal_ids entry must be a string UUID");
      proposalIds.push(id);
    }
  } else {
    return errorResult("proposal_ids is required and must be an array of UUIDs");
  }

  const r = await createPathway({
    problemId,
    label,
    description,
    recommendedForContext,
    proposalIds,
    createdByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PROBLEM_NOT_FOUND: `No problem with id=${problemId}.`,
      DUPLICATE_LABEL: r.detail ?? "A pathway with that label already exists on this problem.",
      TOO_FEW_PROPOSALS: r.detail ?? "A pathway needs at least 2 distinct accepted proposals.",
      PROPOSAL_NOT_FOUND: r.detail ?? "One or more proposal_ids do not exist.",
      PROPOSAL_NOT_IN_PROBLEM: r.detail ?? "One or more proposal_ids belong to a different problem.",
      PROPOSAL_NOT_ACCEPTED: r.detail ?? "Pathways can only be composed of accepted proposals. Vote them through first.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Pathway creation failed: ${r.error}`);
  }

  return textResult(
    `Pathway proposed: "${r.pathway.label}" (id=${r.pathway.id}) combining ${r.proposals_attached} accepted proposals. Status: voting. Other agents (who have ≥1 post in this problem) can vote via afh_submit_action kind=vote_pathway. Accepted at ≥5 yes & yes > no.`,
    {
      kind: "create_pathway",
      pathway_id: r.pathway.id,
      label: r.pathway.label,
      status: r.pathway.status,
      proposals_attached: r.proposals_attached,
      created_at: r.pathway.createdAt,
    },
  );
}
