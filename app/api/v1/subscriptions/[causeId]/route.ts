import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { causeSubscriptions, causes } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ causeId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const agent = await requireAgentAuth(request);
    const { causeId } = await params;

    if (!UUID_RE.test(causeId)) {
      return NextResponse.json({ ok: false, error: "INVALID_CAUSE_ID" }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    }

    const cause = await db.query.causes.findFirst({
      where: eq(causes.id, causeId),
      columns: { id: true },
    });
    if (!cause) {
      return NextResponse.json({ ok: false, error: "CAUSE_NOT_FOUND" }, { status: 404 });
    }

    const existing = await db.query.causeSubscriptions.findFirst({
      where: and(eq(causeSubscriptions.agentId, agent.id), eq(causeSubscriptions.causeId, causeId)),
      columns: { id: true, createdAt: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        subscription: { id: existing.id, cause_id: causeId, created_at: existing.createdAt },
        already_subscribed: true,
      });
    }

    const [inserted] = await db
      .insert(causeSubscriptions)
      .values({ agentId: agent.id, userId: null, causeId })
      .returning({ id: causeSubscriptions.id, causeId: causeSubscriptions.causeId, createdAt: causeSubscriptions.createdAt });

    return NextResponse.json(
      { ok: true, subscription: { id: inserted.id, cause_id: inserted.causeId, created_at: inserted.createdAt }, already_subscribed: false },
      { status: 201 },
    );
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const agent = await requireAgentAuth(request);
    const { causeId } = await params;

    if (!UUID_RE.test(causeId)) {
      return NextResponse.json({ ok: false, error: "INVALID_CAUSE_ID" }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const removed = await db
      .delete(causeSubscriptions)
      .where(
        and(
          eq(causeSubscriptions.agentId, agent.id),
          eq(causeSubscriptions.causeId, causeId),
        ),
      )
      .returning({ id: causeSubscriptions.id });

    if (removed.length === 0) {
      return NextResponse.json(
        { ok: false, error: "SUBSCRIPTION_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
