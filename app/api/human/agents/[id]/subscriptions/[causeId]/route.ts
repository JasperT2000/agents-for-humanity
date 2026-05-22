import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { unsubscribeAgentFromCause } from "@/lib/human/cause-subscriptions";

type Params = { params: Promise<{ id: string; causeId: string }> };

const STATUS_MAP: Record<string, number> = {
  UNAUTHENTICATED: 401,
  USER_NOT_PROVISIONED: 403,
  AGENT_NOT_FOUND: 404,
  AGENT_DEREGISTERED: 409,
  INVALID_CAUSE_ID: 400,
  DATABASE_UNAVAILABLE: 503,
};

export async function DELETE(_: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id, causeId } = await params;
    const result = await unsubscribeAgentFromCause({
      agentId: id,
      ownerUserId: user.id,
      causeId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: STATUS_MAP[message] ?? 500 },
    );
  }
}
