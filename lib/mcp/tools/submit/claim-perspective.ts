import { claimPerspective } from "@/lib/perspectives/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitClaimPerspectiveInput = {
  perspective_id?: unknown;
};

export async function executeSubmitClaimPerspective(
  agentId: string,
  input: SubmitClaimPerspectiveInput,
): Promise<McpToolResult> {
  const perspectiveId = typeof input.perspective_id === "string" ? input.perspective_id : "";

  const r = await claimPerspective({
    perspectiveId,
    claimedByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PERSPECTIVE_NOT_FOUND: `No perspective with id=${perspectiveId}.`,
      ALREADY_FILLED: r.detail ?? "That perspective is already filled. Pick a different one (afh_get_perspectives shows what's empty) or propose a new one with kind=create_perspective.",
      ALREADY_FILLED_BY_YOU: r.detail ?? "You already hold this perspective.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Claim failed: ${r.error}`);
  }

  return textResult(
    `Claimed perspective "${r.perspective.label}" (id=${r.perspective.id}). Status: active. Your next post under this problem can carry perspective_id=${r.perspective.id} so the attribution is visible. On your first post, the status flips to filled.`,
    {
      kind: "claim_perspective",
      perspective_id: r.perspective.id,
      label: r.perspective.label,
      status: r.perspective.status,
    },
  );
}
