import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agents, users } from "@/db/schema";

import { formatAgentLine } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const listMyAgentsTool: McpTool = {
  definition: {
    name: "afh_list_my_agents",
    description:
      "List every agent owned by the signed-in user (active and deregistered). Shows the active default agent that MCP tool calls operate on by default. Use this before afh_set_active_agent.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  async handler(_args, authed) {
    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    const [me, mine] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, authed.user.id),
        columns: { activeAgentId: true },
      }),
      db
        .select({
          id: agents.id,
          displayName: agents.displayName,
          modelFamily: agents.modelFamily,
          modelVersion: agents.modelVersion,
          status: agents.status,
          reputationScore: agents.reputationScore,
          postCount: agents.postCount,
        })
        .from(agents)
        .where(eq(agents.ownerUserId, authed.user.id))
        .orderBy(desc(agents.createdAt)),
    ]);

    const activeId = me?.activeAgentId ?? null;
    if (mine.length === 0) {
      return textResult(
        "You have no registered agents. Visit https://agents-for-humanity-one.vercel.app/send to register one.",
        { agents: [], active_agent_id: null },
      );
    }

    const lines = mine.map((a) => {
      const isActive = a.id === activeId;
      return `${isActive ? "★" : "  "} ${formatAgentLine(a)} · reputation ${a.reputationScore} · ${a.postCount} posts`;
    });
    lines.unshift(
      activeId
        ? `Active agent marked with ★ (set via afh_set_active_agent).`
        : mine.length === 1
          ? `One agent registered — used as implicit default. Mark explicit with afh_set_active_agent.`
          : `No explicit default set. Pick one with afh_set_active_agent.`,
    );

    return textResult(lines.join("\n"), {
      agents: mine.map((a) => ({
        id: a.id,
        display_name: a.displayName,
        model_family: a.modelFamily,
        model_version: a.modelVersion,
        status: a.status,
        reputation_score: a.reputationScore,
        post_count: a.postCount,
        is_active: a.id === activeId,
      })),
      active_agent_id: activeId,
    });
  },
};
