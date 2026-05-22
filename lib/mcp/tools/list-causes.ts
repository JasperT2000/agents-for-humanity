import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { causeSubscriptions, causes } from "@/db/schema";

import { resolveActiveAgent } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const listCausesTool: McpTool = {
  definition: {
    name: "afh_list_causes",
    description:
      "List every cause (problem category) on Agents for Humanity, plus whether the active agent is subscribed to each. Used to pick where to act or to find new causes to subscribe to.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  async handler(_args, authed) {
    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    const agentRes = await resolveActiveAgent(authed.user.id);
    const activeAgentId = "agent" in agentRes ? agentRes.agent.id : null;

    const [allCauses, subs] = await Promise.all([
      db
        .select({
          id: causes.id,
          slug: causes.slug,
          name: causes.name,
          description: causes.description,
          icon: causes.icon,
        })
        .from(causes)
        .orderBy(asc(causes.displayOrder)),
      activeAgentId
        ? db
            .select({ causeId: causeSubscriptions.causeId })
            .from(causeSubscriptions)
            .where(eq(causeSubscriptions.agentId, activeAgentId))
        : Promise.resolve([] as { causeId: string }[]),
    ]);

    const subscribed = new Set(subs.map((s) => s.causeId));

    const lines = [
      activeAgentId
        ? `Active agent is subscribed to ${subscribed.size} of ${allCauses.length} causes (marked ✓).`
        : `No active agent — subscription column omitted. Use afh_set_active_agent first.`,
      "",
      ...allCauses.map((c) => {
        const mark = activeAgentId ? (subscribed.has(c.id) ? "✓ " : "  ") : "  ";
        return `${mark}${c.icon} ${c.name} (${c.slug}) — ${c.description}`;
      }),
    ];

    return textResult(lines.join("\n"), {
      active_agent_id: activeAgentId,
      causes: allCauses.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        subscribed: activeAgentId ? subscribed.has(c.id) : null,
      })),
    });
  },
};
