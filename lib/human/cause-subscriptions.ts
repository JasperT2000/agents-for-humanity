import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { agents, causeSubscriptions, causes } from "@/db/schema";

/**
 * Maximum number of cause subscriptions a single agent may hold.
 *
 * Why: agents subscribed to too many causes spread thin and dilute the
 * "right agent in the right place" signal that drives role-gap matching.
 */
export const MAX_SUBSCRIPTIONS_PER_AGENT = 8;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type SubscriptionRow = {
  id: string;
  causeId: string;
  causeSlug: string;
  causeName: string;
  causeIcon: string;
  createdAt: Date;
};

async function assertAgentOwnedBy(agentId: string, ownerUserId: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.ownerUserId, ownerUserId)),
    columns: { id: true, status: true },
  });
  if (!agent) throw new Error("AGENT_NOT_FOUND");
  if (agent.status === "deregistered") throw new Error("AGENT_DEREGISTERED");
  return agent;
}

export async function listAgentSubscriptions(params: {
  agentId: string;
  ownerUserId: string;
}): Promise<SubscriptionRow[]> {
  await assertAgentOwnedBy(params.agentId, params.ownerUserId);

  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const rows = await db
    .select({
      id: causeSubscriptions.id,
      causeId: causes.id,
      causeSlug: causes.slug,
      causeName: causes.name,
      causeIcon: causes.icon,
      createdAt: causeSubscriptions.createdAt,
    })
    .from(causeSubscriptions)
    .innerJoin(causes, eq(causeSubscriptions.causeId, causes.id))
    .where(eq(causeSubscriptions.agentId, params.agentId));

  return rows;
}

export type BulkSubscribeResult = {
  causeId: string;
  status: "subscribed" | "already_subscribed" | "cause_not_found";
  subscriptionId?: string;
};

/**
 * Subscribes an agent to a set of causes on behalf of its owner.
 *
 * Idempotent per-cause: re-subscribing returns `already_subscribed`.
 * The whole call is rejected if subscribing would push the agent past
 * MAX_SUBSCRIPTIONS_PER_AGENT (counted after deduping requested IDs
 * against existing subscriptions).
 */
export async function subscribeAgentToCauses(params: {
  agentId: string;
  ownerUserId: string;
  causeIds: string[];
}): Promise<BulkSubscribeResult[]> {
  if (params.causeIds.length === 0) throw new Error("CAUSE_IDS_REQUIRED");
  const invalid = params.causeIds.find((id) => !isUuid(id));
  if (invalid) throw new Error("INVALID_CAUSE_ID");

  await assertAgentOwnedBy(params.agentId, params.ownerUserId);

  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const uniqueRequested = Array.from(new Set(params.causeIds));

  const [existingCauses, existingSubs] = await Promise.all([
    db.query.causes.findMany({
      where: inArray(causes.id, uniqueRequested),
      columns: { id: true },
    }),
    db.query.causeSubscriptions.findMany({
      where: eq(causeSubscriptions.agentId, params.agentId),
      columns: { id: true, causeId: true },
    }),
  ]);

  const knownCauseIds = new Set(existingCauses.map((c) => c.id));
  const existingByCause = new Map(existingSubs.map((s) => [s.causeId, s.id]));

  const toInsert = uniqueRequested.filter(
    (id) => knownCauseIds.has(id) && !existingByCause.has(id),
  );

  if (existingSubs.length + toInsert.length > MAX_SUBSCRIPTIONS_PER_AGENT) {
    throw new Error("SUBSCRIPTION_LIMIT_EXCEEDED");
  }

  let inserted: { id: string; causeId: string }[] = [];
  if (toInsert.length > 0) {
    inserted = await db
      .insert(causeSubscriptions)
      .values(
        toInsert.map((causeId) => ({
          agentId: params.agentId,
          userId: null,
          causeId,
        })),
      )
      .returning({
        id: causeSubscriptions.id,
        causeId: causeSubscriptions.causeId,
      });
  }
  const insertedByCause = new Map(inserted.map((r) => [r.causeId, r.id]));

  return uniqueRequested.map((causeId): BulkSubscribeResult => {
    if (!knownCauseIds.has(causeId)) {
      return { causeId, status: "cause_not_found" };
    }
    if (existingByCause.has(causeId)) {
      return {
        causeId,
        status: "already_subscribed",
        subscriptionId: existingByCause.get(causeId),
      };
    }
    return {
      causeId,
      status: "subscribed",
      subscriptionId: insertedByCause.get(causeId),
    };
  });
}

export async function unsubscribeAgentFromCause(params: {
  agentId: string;
  ownerUserId: string;
  causeId: string;
}): Promise<{ removed: boolean }> {
  if (!isUuid(params.causeId)) throw new Error("INVALID_CAUSE_ID");

  await assertAgentOwnedBy(params.agentId, params.ownerUserId);

  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const deleted = await db
    .delete(causeSubscriptions)
    .where(
      and(
        eq(causeSubscriptions.agentId, params.agentId),
        eq(causeSubscriptions.causeId, params.causeId),
      ),
    )
    .returning({ id: causeSubscriptions.id });

  return { removed: deleted.length > 0 };
}
