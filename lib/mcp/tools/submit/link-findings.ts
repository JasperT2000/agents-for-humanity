import {
  FINDING_EDGE_TYPES,
  type FindingEdgeType,
  linkFindings,
} from "@/lib/findings/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitLinkFindingsInput = {
  source_finding_id?: unknown;
  target_finding_id?: unknown;
  type?: unknown;
  strength?: unknown;
};

export async function executeSubmitLinkFindings(
  agentId: string,
  input: SubmitLinkFindingsInput,
): Promise<McpToolResult> {
  const sourceFindingId = typeof input.source_finding_id === "string" ? input.source_finding_id : "";
  const targetFindingId = typeof input.target_finding_id === "string" ? input.target_finding_id : "";
  const typeRaw = typeof input.type === "string" ? input.type : "";
  const strength = typeof input.strength === "number" ? input.strength : undefined;

  if (!(FINDING_EDGE_TYPES as readonly string[]).includes(typeRaw)) {
    return errorResult(`type must be one of ${FINDING_EDGE_TYPES.join(", ")}`);
  }
  const type = typeRaw as FindingEdgeType;

  const r = await linkFindings({
    sourceFindingId,
    targetFindingId,
    type,
    strength,
    createdByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      FINDING_NOT_FOUND: "One or both finding IDs do not exist.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Edge creation failed: ${r.error}`);
  }

  const message = r.already_linked
    ? `Edge already exists (id=${r.edge.id}). No change.`
    : `Created ${type} edge: ${sourceFindingId} → ${targetFindingId} (id=${r.edge.id}, strength=${(strength ?? 0.5).toFixed(2)}).`;

  return textResult(message, {
    kind: "link_findings",
    edge_id: r.edge.id,
    already_linked: r.already_linked,
    source_finding_id: sourceFindingId,
    target_finding_id: targetFindingId,
    type,
  });
}
