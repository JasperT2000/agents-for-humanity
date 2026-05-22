import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { agents, users } from "@/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type ActiveAgent = {
  id: string;
  displayName: string;
  modelFamily: string;
  modelVersion: string | null;
  status: string;
  /**
   * "explicit" — user set users.active_agent_id and it resolves to a usable agent.
   * "implicit_single" — user has exactly one non-deregistered agent, used as default.
   */
  selection: "explicit" | "implicit_single";
};

/**
 * Resolves which agent should act on this user's behalf. Returns null and a
 * reason string when no agent is usable; tools should return that as an
 * isError tool result so the model knows what to do (set active or register).
 */
export async function resolveActiveAgent(
  userId: string,
  overrideAgentId?: string | null,
): Promise<{ agent: ActiveAgent } | { error: "AGENT_NOT_FOUND" | "AGENT_DEREGISTERED" | "NO_AGENTS" | "MULTIPLE_AGENTS_NO_DEFAULT" }> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  if (overrideAgentId !== undefined && overrideAgentId !== null) {
    if (!isUuid(overrideAgentId)) return { error: "AGENT_NOT_FOUND" };
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, overrideAgentId), eq(agents.ownerUserId, userId)),
      columns: {
        id: true,
        displayName: true,
        modelFamily: true,
        modelVersion: true,
        status: true,
      },
    });
    if (!agent) return { error: "AGENT_NOT_FOUND" };
    if (agent.status === "deregistered") return { error: "AGENT_DEREGISTERED" };
    return { agent: { ...agent, selection: "explicit" } };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { activeAgentId: true },
  });

  if (user?.activeAgentId) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, user.activeAgentId), eq(agents.ownerUserId, userId)),
      columns: {
        id: true,
        displayName: true,
        modelFamily: true,
        modelVersion: true,
        status: true,
      },
    });
    if (agent && agent.status !== "deregistered") {
      return { agent: { ...agent, selection: "explicit" } };
    }
    // Stale pointer: fall through to implicit resolution.
  }

  const liveAgents = await db
    .select({
      id: agents.id,
      displayName: agents.displayName,
      modelFamily: agents.modelFamily,
      modelVersion: agents.modelVersion,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.ownerUserId, userId), ne(agents.status, "deregistered")))
    .orderBy(desc(agents.createdAt));

  if (liveAgents.length === 0) return { error: "NO_AGENTS" };
  if (liveAgents.length === 1) {
    return { agent: { ...liveAgents[0], selection: "implicit_single" } };
  }
  return { error: "MULTIPLE_AGENTS_NO_DEFAULT" };
}

/**
 * Pretty-prints an agent line for tool text output. Centralised so every tool
 * reads the same way to the LLM.
 */
export function formatAgentLine(agent: { displayName: string; modelFamily: string; modelVersion: string | null; id: string; status: string }): string {
  const model = agent.modelVersion ? `${agent.modelFamily}:${agent.modelVersion}` : agent.modelFamily;
  return `• ${agent.displayName} (${model}) — id=${agent.id}${agent.status !== "active" ? ` [${agent.status}]` : ""}`;
}
