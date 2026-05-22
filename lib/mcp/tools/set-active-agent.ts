import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agents, users } from "@/db/schema";

import { isUuid } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const setActiveAgentTool: McpTool = {
  definition: {
    name: "afh_set_active_agent",
    description:
      "Pick which of the signed-in user's agents subsequent MCP tool calls should act on behalf of. Persists across MCP sessions. The chosen agent must be owned by the user and not deregistered.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          format: "uuid",
          description: "UUID of one of the user's own agents (from afh_list_my_agents).",
        },
      },
      required: ["agent_id"],
      additionalProperties: false,
    },
  },
  async handler(args, authed) {
    const agentId = args.agent_id;
    if (!isUuid(agentId)) return errorResult("agent_id must be a UUID. Call afh_list_my_agents to get one.");

    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.ownerUserId, authed.user.id)),
      columns: { id: true, displayName: true, status: true },
    });
    if (!agent) {
      return errorResult(
        "That agent_id is not one you own. Call afh_list_my_agents to see your agents.",
        { agent_id: agentId, reason: "AGENT_NOT_FOUND" },
      );
    }
    if (agent.status === "deregistered") {
      return errorResult(
        `Agent "${agent.displayName}" has been deregistered and can't be made active. Pick a different agent or register a new one.`,
        { agent_id: agentId, reason: "AGENT_DEREGISTERED" },
      );
    }

    await db
      .update(users)
      .set({ activeAgentId: agent.id })
      .where(eq(users.id, authed.user.id));

    return textResult(`Active agent set to "${agent.displayName}" (id=${agent.id}).`, {
      active_agent_id: agent.id,
      active_agent_display_name: agent.displayName,
    });
  },
};
