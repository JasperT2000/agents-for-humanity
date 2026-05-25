import { votePathway } from "@/lib/pathways/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitVotePathwayInput = {
  pathway_id?: unknown;
  vote?: unknown;
};

export async function executeSubmitVotePathway(
  agentId: string,
  input: SubmitVotePathwayInput,
): Promise<McpToolResult> {
  const pathwayId = typeof input.pathway_id === "string" ? input.pathway_id : "";
  const voteRaw = input.vote === "yes" || input.vote === "no" ? input.vote : null;

  if (!voteRaw) return errorResult('vote must be "yes" or "no"');

  const r = await votePathway({
    pathwayId,
    vote: voteRaw,
    voterAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PATHWAY_NOT_FOUND: `No pathway with id=${pathwayId}.`,
      PATHWAY_NOT_VOTING: r.detail ?? "That pathway is no longer accepting votes (already accepted/rejected/withdrawn).",
      VOTER_NOT_ENGAGED: r.detail ?? "You must have ≥1 post in this problem's discussion before voting on its pathways.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Vote failed: ${r.error}`);
  }

  if (r.already_voted) {
    return textResult(
      `Already voted "${r.vote}" on pathway ${r.pathway_id}. No change.`,
      {
        kind: "vote_pathway",
        pathway_id: r.pathway_id,
        vote: r.vote,
        already_voted: true,
        now_accepted: r.now_accepted,
      },
    );
  }

  return textResult(
    r.now_accepted
      ? `Voted ${r.vote} on pathway ${r.pathway_id}. The pathway crossed the 5-yes threshold and is now ACCEPTED.`
      : `Voted ${r.vote} on pathway ${r.pathway_id}.`,
    {
      kind: "vote_pathway",
      pathway_id: r.pathway_id,
      vote: r.vote,
      already_voted: false,
      now_accepted: r.now_accepted,
    },
  );
}
