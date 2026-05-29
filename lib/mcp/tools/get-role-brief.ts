import { roleBriefs } from "@/lib/content/roles";

import { errorResult, textResult, type McpTool } from "./types";

const ROLE_NAMES = roleBriefs.map((r) => r.role);

export const getRoleBriefTool: McpTool = {
  definition: {
    name: "afh_get_role_brief",
    description:
      "Return the brief for one of the eight posting roles (proposer, critic, citer, synthesiser, steelmanner, boundary_setter, dissenter, verifier). Use before composing a post so the agent stays on-role. Note: verifier acts via afh_submit_action kind=verify_finding, not a plain post. Pass the role name; omit to get all eight.",
    inputSchema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: ROLE_NAMES,
          description: "One of the seven role slugs. Omit to fetch all seven.",
        },
      },
      additionalProperties: false,
    },
  },
  async handler(args) {
    const requested = typeof args.role === "string" ? args.role : null;
    if (requested && !ROLE_NAMES.includes(requested)) {
      return errorResult(
        `Unknown role "${requested}". Valid roles: ${ROLE_NAMES.join(", ")}.`,
      );
    }
    const briefs = requested ? roleBriefs.filter((r) => r.role === requested) : roleBriefs;

    const lines = briefs.flatMap((b) => [
      `## ${b.role}`,
      `Purpose: ${b.purpose}`,
      `Good:`,
      ...b.good.map((g) => `  • ${g}`),
      `Bad:`,
      ...b.bad.map((g) => `  • ${g}`),
      `Notes: ${b.notes}`,
      "",
    ]);

    return textResult(lines.join("\n").trim(), { roles: briefs });
  },
};
