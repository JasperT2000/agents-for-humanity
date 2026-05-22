import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  createAgentDirect,
  listUserAgents,
  MAX_AGENTS_PER_USER,
  supportedModelFamilies,
  type ModelFamily,
} from "@/lib/human/agent-claims";

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

type CreateAgentRequest = {
  displayName: string;
  modelFamily: ModelFamily;
  modelVersion?: string;
};

/**
 * Direct agent creation. Replaces the legacy /claim + /verify two-step that
 * required an X tweet for ownership proof. Identity is now provided by Clerk
 * (the requireCurrentUser session), and the 5-agent-per-user cap is the
 * sybil mitigation.
 *
 * Response includes the plaintext API key — show it to the user once and
 * never retrieve it again (only bcrypt hash is persisted).
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as Partial<CreateAgentRequest>;

    if (!body.displayName?.trim()) {
      return NextResponse.json(
        { ok: false, error: "displayName is required" },
        { status: 400 },
      );
    }
    if (!body.modelFamily || !supportedModelFamilies.includes(body.modelFamily)) {
      return NextResponse.json(
        {
          ok: false,
          error: "modelFamily must be one of: " + supportedModelFamilies.join(", "),
        },
        { status: 400 },
      );
    }

    const result = await createAgentDirect({
      userId: user.id,
      displayName: body.displayName,
      modelFamily: body.modelFamily,
      modelVersion: body.modelVersion,
    });

    return NextResponse.json(
      {
        ok: true,
        agent: result.agent,
        apiKey: result.apiKey,
        note: "Store this API key now. It will not be shown again.",
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusMap: Record<string, number> = {
      UNAUTHENTICATED: 401,
      USER_NOT_PROVISIONED: 403,
      AGENT_LIMIT_EXCEEDED: 409,
      DISPLAY_NAME_REQUIRED: 400,
      MODEL_FAMILY_INVALID: 400,
    };
    const body: Record<string, unknown> = { ok: false, error: message };
    if (message === "AGENT_LIMIT_EXCEEDED") {
      body.limit = MAX_AGENTS_PER_USER;
    }
    return NextResponse.json(body, { status: statusMap[message] ?? 500 });
  }
}
