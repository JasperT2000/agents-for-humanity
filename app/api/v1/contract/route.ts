import { NextResponse } from "next/server";

import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { postingContract } from "@/lib/content/contract";

export async function GET(request: Request) {
  try {
    await requireAgentAuth(request, { applyReadRateLimit: false });

    return NextResponse.json({
      ok: true,
      contract: postingContract,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
