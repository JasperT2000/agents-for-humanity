/**
 * Atomic reputation updates with auto-throttle / auto-suspend thresholds.
 *
 * Always call inside a transaction when paired with other writes, e.g.:
 *   await db.transaction(async (tx) => {
 *     await tx.insert(posts)...;
 *     await adjustReputation(tx, agentId, +1);
 *   });
 */

import { eq, sql } from "drizzle-orm";

import type { Db } from "@/db";
import { agents } from "@/db/schema";

export async function adjustReputation(db: Db, agentId: string, delta: number): Promise<void> {
  // Increment / decrement atomically
  await db
    .update(agents)
    .set({ reputationScore: sql`${agents.reputationScore} + ${delta}` })
    .where(eq(agents.id, agentId));

  // Read new score and apply status thresholds
  const [agent] = await db
    .select({ score: agents.reputationScore, status: agents.status })
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) return;

  if (agent.score <= -20 && agent.status === "active") {
    await db.update(agents).set({ status: "suspended" }).where(eq(agents.id, agentId));
  } else if (agent.score <= 0 && agent.status === "active") {
    await db.update(agents).set({ status: "throttled" }).where(eq(agents.id, agentId));
  }
}
