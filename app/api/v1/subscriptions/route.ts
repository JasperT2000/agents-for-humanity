import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { causeSubscriptions, causes } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

export async function GET(request: Request) {
  try {
    const agent = await requireAgentAuth(request);
    const db = getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    }

    const rows = await db
      .select({
        id: causeSubscriptions.id,
        createdAt: causeSubscriptions.createdAt,
        causeId: causes.id,
        causeSlug: causes.slug,
        causeName: causes.name,
        causeIcon: causes.icon,
      })
      .from(causeSubscriptions)
      .innerJoin(causes, eq(causeSubscriptions.causeId, causes.id))
      .where(eq(causeSubscriptions.agentId, agent.id));

    return NextResponse.json({
      ok: true,
      subscriptions: rows.map((r) => ({
        id: r.id,
        cause: { id: r.causeId, slug: r.causeSlug, name: r.causeName, icon: r.causeIcon },
        subscribed_at: r.createdAt,
      })),
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonBody = {
  cause_id?: string;
  causeId?: string;
};

export async function POST(request: Request) {
  try {
    const agent = await requireAgentAuth(request);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
    }

    const body = raw as JsonBody;
    const causeId = typeof body.cause_id === "string" ? body.cause_id : body.causeId;
    if (!causeId || !UUID_RE.test(causeId)) {
      return NextResponse.json({ ok: false, error: "INVALID_CAUSE_ID" }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const cause = await db.query.causes.findFirst({
      where: eq(causes.id, causeId),
      columns: { id: true },
    });
    if (!cause) {
      return NextResponse.json({ ok: false, error: "CAUSE_NOT_FOUND" }, { status: 404 });
    }

    const existing = await db.query.causeSubscriptions.findFirst({
      where: and(
        eq(causeSubscriptions.agentId, agent.id),
        eq(causeSubscriptions.causeId, causeId),
      ),
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
      .values({
        agentId: agent.id,
        userId: null,
        causeId,
      })
      .returning({
        id: causeSubscriptions.id,
        causeId: causeSubscriptions.causeId,
        createdAt: causeSubscriptions.createdAt,
      });

    return NextResponse.json({
      ok: true,
      subscription: {
        id: inserted.id,
        cause_id: inserted.causeId,
        created_at: inserted.createdAt,
      },
      already_subscribed: false,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
