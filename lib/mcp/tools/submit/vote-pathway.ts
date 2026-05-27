import { votePathway } from "@/lib/pathways/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitVotePathwayInput = {
  pathway_id?: unknown;
  vote?: unknown;
  /** Phase 5 (perspectives-per-action): which perspective the voter is
   *  speaking from for this pathway vote. Required on strict-mode problems. */
  voter_perspective_id?: unknown;
};

export async function executeSubmitVotePathway(
  agentId: string,
  input: SubmitVotePathwayInput,
): Promise<McpToolResult> {
  const pathwayId = typeof input.pathway_id === "string" ? input.pathway_id : "";
  const voteRaw = input.vote === "yes" || input.vote === "no" ? input.vote : null;
  const voterPerspectiveId =
    typeof input.voter_perspective_id === "string" ? input.voter_perspective_id : undefined;

  if (!voteRaw) return errorResult('vote must be "yes" or "no"');

  const r = await votePathway({
    pathwayId,
    vote: voteRaw,
    voterAgentId: agentId,
    voterPerspectiveId,
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
      r.perspective_label
        ? `Perspective "${r.perspective_label}" already voted "${r.vote}" on pathway ${r.pathway_id}. Each perspective votes at most once per pathway.`
        : `Already voted "${r.vote}" on pathway ${r.pathway_id}. No change.`,
      {
        kind: "vote_pathway",
        pathway_id: r.pathway_id,
        vote: r.vote,
        already_voted: true,
        now_accepted: r.now_accepted,
        perspective_label: r.perspective_label,
      },
    );
  }

  const quorum = r.council_quorum;
  const baseLabel = r.perspective_label ? ` as "${r.perspective_label}"` : "";
  const acceptedMsg = quorum
    ? `Voted ${r.vote} on pathway ${r.pathway_id}${baseLabel}. Council quorum reached (${quorum.voted}/${quorum.filled_total}) and supermajority cleared — pathway is now ACCEPTED.`
    : `Voted ${r.vote} on pathway ${r.pathway_id}. The pathway crossed the legacy 5-yes threshold and is now ACCEPTED.`;
  const pendingMsg = quorum
    ? `Voted ${r.vote} on pathway ${r.pathway_id}${baseLabel}. Council quorum: ${quorum.voted}/${quorum.filled_total} perspectives have voted (need all ${quorum.filled_total}, plus ≥${quorum.yes_needed} yes). ${Math.max(0, quorum.filled_total - quorum.voted)} perspective(s) still owe a vote.`
    : `Voted ${r.vote} on pathway ${r.pathway_id}.`;

  return textResult(r.now_accepted ? acceptedMsg : pendingMsg, {
    kind: "vote_pathway",
    pathway_id: r.pathway_id,
    vote: r.vote,
    already_voted: false,
    now_accepted: r.now_accepted,
    perspective_label: r.perspective_label,
    council_quorum: r.council_quorum,
  });
}
