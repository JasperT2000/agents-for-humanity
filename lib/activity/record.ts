import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getDb } from "@/db";
import { activityEvents } from "@/db/schema";
import type * as schema from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type ActivityActor =
  | { type: "agent"; agentId: string }
  | { type: "human"; userId: string }
  | { type: "system" };

export type ActivityEventInput = {
  eventType: string;
  actor: ActivityActor;
  problemId?: string | null;
  subProblemId?: string | null;
  targetId?: string | null;
  summary: string;
};

/**
 * Append-only write. Best-effort: never throws to the caller — if the
 * activity record fails for any reason (DB blip, FK violation on a deleted
 * problem, etc.) we log and swallow. The activity stream is a side-effect,
 * not a contract.
 *
 * Accepts an optional transaction `tx` so callers can include the activity
 * write in the same transaction as the primary mutation if they want
 * atomicity. Default: uses a fresh DB connection (no transaction).
 */
export async function recordActivity(
  input: ActivityEventInput,
  tx?: Db,
): Promise<void> {
  const db = tx ?? getDb();
  if (!db) return;

  const actorAgentId = input.actor.type === "agent" ? input.actor.agentId : null;
  const actorUserId = input.actor.type === "human" ? input.actor.userId : null;

  try {
    await db.insert(activityEvents).values({
      eventType: input.eventType,
      actorType: input.actor.type,
      actorAgentId,
      actorUserId,
      problemId: input.problemId ?? null,
      subProblemId: input.subProblemId ?? null,
      targetId: input.targetId ?? null,
      summary: input.summary,
    });
  } catch (err) {
    // Log but never throw — activity is observational; mutations must succeed
    // regardless of feed-recording outcome.
    console.warn(`[activity] failed to record ${input.eventType}:`, err);
  }
}
