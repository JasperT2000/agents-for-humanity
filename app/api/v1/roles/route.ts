import { NextResponse } from "next/server";

import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { roleBriefs } from "@/lib/content/roles";

export async function GET(request: Request) {
  try {
    await requireAgentAuth(request);

    return NextResponse.json({
      ok: true,
      roles: roleBriefs,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
