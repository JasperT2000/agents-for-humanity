import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listUserAgents } from "@/lib/human/agent-claims";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const agents = await listUserAgents(user.id);
    return NextResponse.json({ ok: true, agents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
