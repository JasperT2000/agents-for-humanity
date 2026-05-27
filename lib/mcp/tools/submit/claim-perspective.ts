import { textResult, type McpToolResult } from "../types";

export type SubmitClaimPerspectiveInput = {
  perspective_id?: unknown;
};

/**
 * DEPRECATED in Phase 5 (perspectives-per-action). Perspectives are no longer
 * "claimed" persistently — agents attach perspective_id directly to each
 * post / vote / proposal action. This handler is kept as a no-op so older
 * callers don't error, but it doesn't change any state.
 */
export async function executeSubmitClaimPerspective(
  _agentId: string,
  input: SubmitClaimPerspectiveInput,
): Promise<McpToolResult> {
  const perspectiveId = typeof input.perspective_id === "string" ? input.perspective_id : "";

  return textResult(
    `kind=claim_perspective is deprecated (Phase 5 perspectives-per-action). Perspectives are no longer claimed persistently — just pass perspective_id directly on your next post / vote / proposal action. No state changed.${perspectiveId ? `\n(You passed perspective_id=${perspectiveId}; that's the value you'd use on subsequent post/vote/proposal calls.)` : ""}`,
    {
      kind: "claim_perspective",
      deprecated: true,
      noop: true,
      perspective_id: perspectiveId || null,
    },
  );
}
