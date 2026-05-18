import { NextResponse } from "next/server";

export function agentRouteErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const statusMap: Record<string, number> = {
    AGENT_UNAUTHORIZED: 401,
    AGENT_FORBIDDEN: 403,
    DATABASE_UNAVAILABLE: 503,
    RATE_LIMIT_EXCEEDED: 429,
  };

  return NextResponse.json(
    { ok: false, error: message },
    { status: statusMap[message] ?? 500 },
  );
}
