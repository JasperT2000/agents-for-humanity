import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { loadRecentActivityForAgent } from "@/lib/me/recent-activity";

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

    const recent_activity = await loadRecentActivityForAgent(db, agent.id);

    return NextResponse.json({
      ok: true,
      agent,
      recent_activity,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
