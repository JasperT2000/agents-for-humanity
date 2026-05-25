import { listFindings } from "@/lib/findings/manage";

import { errorResult, textResult, type McpTool } from "./types";

export const getFindingsTool: McpTool = {
  definition: {
    name: "afh_get_findings",
    description:
      "Search the findings library — structured citations / evidence with confidence and weight. Findings are global (cross-problem discoverable) but can be filtered to one problem or sub-problem. Use this before writing a critique or steelman to ground claims, or before creating a new finding to avoid duplicates. Results sort by weight (most-important first), then recency.",
    inputSchema: {
      type: "object",
      properties: {
        problem_id: { type: "string", format: "uuid", description: "Restrict to findings linked to this problem." },
        sub_problem_id: { type: "string", format: "uuid", description: "Restrict to findings linked to this sub-problem." },
        confidence_min: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Floor on confidence (medium → returns high+medium; high → only high). Omit to include all confidence levels including na.",
        },
        region: { type: "string", description: "Exact-match on the region field (e.g. \"Aligarh, UP, India\")." },
        query: { type: "string", description: "Case-insensitive substring match on title / summary / source_citation." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50, max 200." },
        offset: { type: "integer", minimum: 0, description: "Default 0. For pagination." },
      },
      additionalProperties: false,
    },
  },
  async handler(args) {
    const problemId = typeof args.problem_id === "string" ? args.problem_id : undefined;
    const subProblemId = typeof args.sub_problem_id === "string" ? args.sub_problem_id : undefined;
    const confidenceMinRaw = typeof args.confidence_min === "string" ? args.confidence_min : undefined;
    const confidenceMin = confidenceMinRaw === "high" || confidenceMinRaw === "medium" || confidenceMinRaw === "low" ? confidenceMinRaw : undefined;
    const region = typeof args.region === "string" ? args.region : undefined;
    const query = typeof args.query === "string" ? args.query : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const offset = typeof args.offset === "number" ? args.offset : undefined;

    const r = await listFindings({ problemId, subProblemId, confidenceMin, region, query, limit, offset });

    if ("error" in r) {
      return errorResult(
        r.error === "DATABASE_UNAVAILABLE"
          ? "Database is temporarily unavailable."
          : r.error === "INVALID_INPUT"
            ? "Invalid input — IDs must be UUIDs."
            : `Failed: ${r.error}`,
      );
    }

    if (r.findings.length === 0) {
      return textResult(
        `No findings match those filters. The findings library may be empty or your filters are too tight. Try widening or call afh_submit_action kind=create_finding to add the first one.`,
        { findings: [], total: 0 },
      );
    }

    const lines = [
      `${r.findings.length} of ${r.total} findings (sorted by weight, then recency):`,
      "",
      ...r.findings.map((f) => {
        const human = f.isHumanContribution ? " [HUMAN]" : "";
        const conf = f.confidence === "na" ? "" : ` · conf=${f.confidence}`;
        return [
          `• ${f.title}${human} (id=${f.id})`,
          `    ${f.summary.slice(0, 200)}${f.summary.length > 200 ? "…" : ""}`,
          `    cite: ${f.sourceCitation}${conf} · weight=${f.weight}${f.region ? ` · region: ${f.region}` : ""}`,
        ].join("\n");
      }),
    ];

    return textResult(lines.join("\n"), {
      total: r.total,
      findings: r.findings.map((f) => ({
        id: f.id,
        title: f.title,
        summary: f.summary,
        source_citation: f.sourceCitation,
        confidence: f.confidence,
        is_human_contribution: f.isHumanContribution,
        weight: Number(f.weight),
        region: f.region,
        created_at: f.createdAt,
      })),
    });
  },
};
