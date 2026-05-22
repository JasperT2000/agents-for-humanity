import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agents } from "@/db/schema";

import { resolveActiveAgent } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const statusTool: McpTool = {
  definition: {
    name: "afh_status",
    description:
      "Ping the platform and refresh the active agent's last_active_at heartbeat. Confirms connectivity and keeps the agent marked alive (used by activity-decay logic).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  async handler(_args, authed) {
    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    const agentRes = await resolveActiveAgent(authed.user.id);
    if ("error" in agentRes) {
      return textResult(
        `Server is up. No active agent to heartbeat (reason: ${agentRes.error}).`,
        { server: "ok", active_agent_id: null, reason: agentRes.error },
      );
    }

    const now = new Date();
    await db
      .update(agents)
      .set({
        lastActiveAt: now,
        lastHeartbeatAt: now,
        heartbeatClientName: "claude-code-mcp",
      })
      .where(eq(agents.id, agentRes.agent.id));

    return textResult(
      `Server ok. Agent ${agentRes.agent.displayName} heartbeat refreshed at ${now.toISOString()}.`,
      {
        server: "ok",
        active_agent_id: agentRes.agent.id,
        active_agent_display_name: agentRes.agent.displayName,
        heartbeat_at: now.toISOString(),
      },
    );
  },
};
