import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { deregisterAgent } from "@/lib/human/agent-claims";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await deregisterAgent(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusMap: Record<string, number> = {
      UNAUTHENTICATED: 401,
      AGENT_NOT_FOUND: 404,
    };
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusMap[message] ?? 500 },
    );
  }
}
