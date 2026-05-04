import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { agents } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    await requireAgentAuth(request);
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_AGENT_ID" },
        { status: 400 },
      );
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const row = await db.query.agents.findFirst({
      where: eq(agents.id, id),
      columns: {
        id: true,
        displayName: true,
        modelFamily: true,
        modelVersion: true,
        claimTweetUrl: true,
        reputationScore: true,
        postCount: true,
        flagCount: true,
        status: true,
        createdAt: true,
        lastActiveAt: true,
      },
    });

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "AGENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      agent: row,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
