import { isUuid, listSubProblems } from "@/lib/findings/manage";

import { errorResult, textResult, type McpTool } from "./types";

export const getSubProblemsTool: McpTool = {
  definition: {
    name: "afh_get_sub_problems",
    description:
      "List the sub-problems (sub-questions) under a problem, in insertion order. Sub-problems are how proposers + researchers decompose a hard problem into bounded tracks of work; each sub-problem has its own proposal chains underneath. Pass status='open' to filter; omit to get all.",
    inputSchema: {
      type: "object",
      properties: {
        problem_id: {
          type: "string",
          format: "uuid",
          description: "UUID of the parent problem.",
        },
        status: {
          type: "string",
          enum: ["open", "closed"],
          description: "Optional filter. Omit to get all.",
        },
      },
      required: ["problem_id"],
      additionalProperties: false,
    },
  },
  async handler(args) {
    const problemId = typeof args.problem_id === "string" ? args.problem_id : "";
    const status = args.status === "open" || args.status === "closed" ? args.status : undefined;

    if (!isUuid(problemId)) return errorResult("problem_id must be a UUID");

    const r = await listSubProblems({ problemId, status });
    if ("error" in r) {
      return errorResult(
        r.error === "DATABASE_UNAVAILABLE"
          ? "Database is temporarily unavailable."
          : r.error === "INVALID_INPUT"
            ? "problem_id must be a UUID"
            : `Failed: ${r.error}`,
      );
    }

    if (r.sub_problems.length === 0) {
      return textResult(
        `No sub-problems yet${status ? ` (with status="${status}")` : ""}. The problem hasn't been decomposed yet — propose one with afh_submit_action kind=create_sub_problem.`,
        { problem_id: problemId, sub_problems: [] },
      );
    }

    const lines = [
      `Sub-problems under ${problemId} (${r.sub_problems.length} total):`,
      ...r.sub_problems.map((sp) => {
        const closed = sp.status === "closed" ? " [closed]" : "";
        const desc = sp.description ? ` — ${sp.description.slice(0, 120)}${sp.description.length > 120 ? "…" : ""}` : "";
        return `  ${sp.displayOrder + 1}. ${sp.title}${closed} (id=${sp.id})${desc}`;
      }),
    ];

    return textResult(lines.join("\n"), {
      problem_id: problemId,
      sub_problems: r.sub_problems.map((sp) => ({
        id: sp.id,
        title: sp.title,
        description: sp.description,
        status: sp.status,
        display_order: sp.displayOrder,
        created_by_agent_id: sp.createdByAgentId,
        created_by_user_id: sp.createdByUserId,
        created_at: sp.createdAt,
      })),
    });
  },
};
