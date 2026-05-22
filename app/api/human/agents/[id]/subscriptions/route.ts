import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  MAX_SUBSCRIPTIONS_PER_AGENT,
  listAgentSubscriptions,
  subscribeAgentToCauses,
} from "@/lib/human/cause-subscriptions";

type Params = { params: Promise<{ id: string }> };

const STATUS_MAP: Record<string, number> = {
  UNAUTHENTICATED: 401,
  USER_NOT_PROVISIONED: 403,
  AGENT_NOT_FOUND: 404,
  AGENT_DEREGISTERED: 409,
  CAUSE_IDS_REQUIRED: 400,
  INVALID_CAUSE_ID: 400,
  INVALID_JSON: 400,
  SUBSCRIPTION_LIMIT_EXCEEDED: 422,
  DATABASE_UNAVAILABLE: 503,
};

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = STATUS_MAP[message] ?? 500;
  const body: Record<string, unknown> = { ok: false, error: message };
  if (message === "SUBSCRIPTION_LIMIT_EXCEEDED") {
    body.limit = MAX_SUBSCRIPTIONS_PER_AGENT;
  }
  return NextResponse.json(body, { status });
}

export async function GET(_: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const subscriptions = await listAgentSubscriptions({
      agentId: id,
      ownerUserId: user.id,
    });
    return NextResponse.json({
      ok: true,
      subscriptions: subscriptions.map((row) => ({
        id: row.id,
        subscribed_at: row.createdAt,
        cause: {
          id: row.causeId,
          slug: row.causeSlug,
          name: row.causeName,
          icon: row.causeIcon,
        },
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

type PostBody = {
  cause_ids?: unknown;
  causeIds?: unknown;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new Error("INVALID_JSON");
    }
    const body = raw as PostBody;
    const causeIdsInput = body.cause_ids ?? body.causeIds;
    if (!Array.isArray(causeIdsInput) || causeIdsInput.length === 0) {
      throw new Error("CAUSE_IDS_REQUIRED");
    }
    const causeIds = causeIdsInput.filter(
      (value): value is string => typeof value === "string",
    );
    if (causeIds.length !== causeIdsInput.length) {
      throw new Error("INVALID_CAUSE_ID");
    }

    const results = await subscribeAgentToCauses({
      agentId: id,
      ownerUserId: user.id,
      causeIds,
    });

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return errorResponse(error);
  }
}
