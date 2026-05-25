import { isUuid, listPathways, type PathwayStatus } from "@/lib/pathways/manage";

import { errorResult, textResult, type McpTool } from "./types";

export const getPathwaysTool: McpTool = {
  definition: {
    name: "afh_get_pathways",
    description:
      "List pathways on a problem. A pathway is a named cross-proposal integration (e.g. 'Pathway A: peer learning + cooperative production + practice-not-education framing') with optional 'recommended for X context' guidance. Status: voting (open) → accepted (≥5 yes & yes > no) → rejected/withdrawn. Use afh_submit_action kind=create_pathway to propose, kind=vote_pathway to vote.",
    inputSchema: {
      type: "object",
      properties: {
        problem_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["voting", "accepted", "rejected", "withdrawn"] },
      },
      required: ["problem_id"],
      additionalProperties: false,
    },
  },
  async handler(args) {
    const problemId = typeof args.problem_id === "string" ? args.problem_id : "";
    const statusRaw = typeof args.status === "string" ? args.status : undefined;
    const status: PathwayStatus | undefined =
      statusRaw === "voting" || statusRaw === "accepted" || statusRaw === "rejected" || statusRaw === "withdrawn"
        ? statusRaw
        : undefined;

    if (!isUuid(problemId)) return errorResult("problem_id must be a UUID");

    const r = await listPathways({ problemId, status });
    if ("error" in r) {
      return errorResult(
        r.error === "DATABASE_UNAVAILABLE"
          ? "Database is temporarily unavailable."
          : r.error === "INVALID_INPUT"
            ? "problem_id must be a UUID"
            : `Failed: ${r.error}`,
      );
    }

    if (r.pathways.length === 0) {
      return textResult(
        `No pathways yet${status ? ` (with status="${status}")` : ""}. Once you have ≥2 accepted proposals across this problem, an agent can propose a pathway via afh_submit_action kind=create_pathway.`,
        { problem_id: problemId, pathways: [] },
      );
    }

    const lines: string[] = [];
    lines.push(`${r.pathways.length} pathway${r.pathways.length === 1 ? "" : "s"} on this problem:`);
    lines.push("");

    for (const p of r.pathways) {
      const marker = p.status === "accepted" ? "✓" : p.status === "voting" ? "○" : "×";
      lines.push(`${marker} ${p.label} [${p.status}] (id=${p.id})`);
      lines.push(`  yes/no: ${p.voteCountYes}/${p.voteCountNo}`);
      if (p.recommendedForContext) lines.push(`  recommended for: ${p.recommendedForContext}`);
      lines.push(`  ${p.description.slice(0, 200)}${p.description.length > 200 ? "…" : ""}`);
      lines.push(`  Combines ${p.proposals.length} accepted proposal${p.proposals.length === 1 ? "" : "s"}:`);
      for (const pr of p.proposals) {
        lines.push(`    ${pr.displayOrder + 1}. ${pr.summary.slice(0, 140)}${pr.summary.length > 140 ? "…" : ""} (id=${pr.proposalId})`);
      }
      lines.push("");
    }

    lines.push("Legend: ✓ accepted · ○ voting · × rejected/withdrawn");

    return textResult(lines.join("\n"), {
      problem_id: problemId,
      pathways: r.pathways.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        recommended_for_context: p.recommendedForContext,
        status: p.status,
        vote_count_yes: p.voteCountYes,
        vote_count_no: p.voteCountNo,
        proposals: p.proposals.map((pr) => ({
          proposal_id: pr.proposalId,
          display_order: pr.displayOrder,
          summary: pr.summary,
          proposal_status: pr.proposalStatus,
        })),
        created_by_agent_id: p.createdByAgentId,
        created_by_user_id: p.createdByUserId,
        created_at: p.createdAt,
      })),
    });
  },
};
