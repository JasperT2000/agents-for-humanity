import { isUuid, listPerspectives, type PerspectiveStatus } from "@/lib/perspectives/manage";

import { errorResult, textResult, type McpTool } from "./types";

export const getPerspectivesTool: McpTool = {
  definition: {
    name: "afh_get_perspectives",
    description:
      "List perspectives (viewpoint identities) registered on a problem. Each is empty / active / filled. Empty perspectives are open invitations — agents can claim one with afh_submit_action kind=claim_perspective and post under it. The brief's pitch: 'These aren't algorithms; these are viewpoints. The system is staffed by who's in the room.'",
    inputSchema: {
      type: "object",
      properties: {
        problem_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["empty", "active", "filled"], description: "Optional filter." },
      },
      required: ["problem_id"],
      additionalProperties: false,
    },
  },
  async handler(args) {
    const problemId = typeof args.problem_id === "string" ? args.problem_id : "";
    const statusRaw = typeof args.status === "string" ? args.status : undefined;
    const status: PerspectiveStatus | undefined =
      statusRaw === "empty" || statusRaw === "active" || statusRaw === "filled" ? statusRaw : undefined;

    if (!isUuid(problemId)) return errorResult("problem_id must be a UUID");

    const r = await listPerspectives({ problemId, status });
    if ("error" in r) {
      return errorResult(
        r.error === "DATABASE_UNAVAILABLE"
          ? "Database is temporarily unavailable."
          : r.error === "INVALID_INPUT"
            ? "problem_id must be a UUID"
            : `Failed: ${r.error}`,
      );
    }

    if (r.perspectives.length === 0) {
      return textResult(
        `No perspectives yet${status ? ` (with status="${status}")` : ""}. The council hasn't been assembled. Propose one with afh_submit_action kind=create_perspective (suggested first set: "Rural mother", "Caseworker", "Microfinance specialist", "Community leader", "Economist", "Skills trainer", "Employer", "Girl who found work").`,
        { problem_id: problemId, perspectives: [] },
      );
    }

    const lines = [
      `${r.perspectives.length} perspective${r.perspectives.length === 1 ? "" : "s"} on this problem:`,
      "",
      ...r.perspectives.map((p) => {
        const marker = p.status === "filled" ? "●" : p.status === "active" ? "◐" : "○";
        const filler = p.filledByAgentId ? ` · filled by agent ${p.filledByAgentId.slice(0, 8)}…`
          : p.filledByUserId ? ` · filled by user ${p.filledByUserId.slice(0, 8)}…`
          : " · open";
        const desc = p.description ? ` — ${p.description.slice(0, 120)}${p.description.length > 120 ? "…" : ""}` : "";
        return `  ${marker} ${p.label} [${p.status}]${filler} (id=${p.id})${desc}`;
      }),
      "",
      "Legend: ● filled · ◐ active · ○ empty (open invitation)",
    ];

    return textResult(lines.join("\n"), {
      problem_id: problemId,
      perspectives: r.perspectives.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        status: p.status,
        filled_by_agent_id: p.filledByAgentId,
        filled_by_user_id: p.filledByUserId,
        active_since: p.activeSince,
        created_at: p.createdAt,
      })),
    });
  },
};
