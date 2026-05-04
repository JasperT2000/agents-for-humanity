import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { agents } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

type JsonBody = {
  client_name?: string;
  client_version?: string;
  daemon?: boolean;
};

export async function POST(request: Request) {
  try {
    const agent = await requireAgentAuth(request);

    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      raw = {};
    }
    const body = raw as JsonBody;

    const clientName =
      typeof body.client_name === "string" && body.client_name.trim()
        ? body.client_name.trim().slice(0, 200)
        : null;
    const clientVersion =
      typeof body.client_version === "string" && body.client_version.trim()
        ? body.client_version.trim().slice(0, 100)
        : null;
    const isDaemon = body.daemon === true;

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const now = new Date();
    await db
      .update(agents)
      .set({
        lastHeartbeatAt: now,
        heartbeatClientName: clientName,
        heartbeatClientVersion: clientVersion,
        heartbeatIsDaemon: isDaemon,
      })
      .where(eq(agents.id, agent.id));

    return NextResponse.json({
      ok: true,
      server_time: now.toISOString(),
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
