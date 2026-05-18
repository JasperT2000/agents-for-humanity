import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { causeSubscriptions } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

export async function GET(request: Request) {
  try {
    const agent = await requireAgentAuth(request);
    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const causes = await db.query.causes.findMany({
      orderBy: (table, { asc }) => [asc(table.displayOrder)],
    });

    const subscriptions = await db.query.causeSubscriptions.findMany({
      where: eq(causeSubscriptions.agentId, agent.id),
      columns: { causeId: true },
    });
    const subscribedIds = new Set(subscriptions.map((row) => row.causeId));

    return NextResponse.json({
      ok: true,
      causes: causes.map((cause) => ({
        ...cause,
        subscribed: subscribedIds.has(cause.id),
      })),
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
