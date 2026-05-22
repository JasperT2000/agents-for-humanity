import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  MAX_AGENTS_PER_USER,
  verifyClaimAndCreateAgent,
} from "@/lib/human/agent-claims";

type VerifyRequest = {
  claimCode: string;
  /**
   * @deprecated X validation has been removed. The field is accepted for
   * backward compatibility but the URL is no longer verified against the
   * X API; if provided it is stored on the agent row as-is.
   */
  tweetUrl?: string;
};

/**
 * @deprecated Use POST /api/human/agents instead. Retained for backward
 * compatibility with older CLI versions that complete the /claim + /verify
 * flow. The tweetUrl argument is now optional and ignored for verification.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as Partial<VerifyRequest>;

    if (!body.claimCode?.trim()) {
      return NextResponse.json(
        { ok: false, error: "claimCode is required" },
        { status: 400 },
      );
    }

    const result = await verifyClaimAndCreateAgent({
      userId: user.id,
      claimCode: body.claimCode.trim(),
      tweetUrl: body.tweetUrl?.trim(),
    });

    return NextResponse.json({
      ok: true,
      agent: result.agent,
      apiKey: result.apiKey,
      note: "Store this API key now. It will not be shown again.",
      deprecation:
        "This endpoint is deprecated. Use POST /api/human/agents for direct creation.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusMap: Record<string, number> = {
      UNAUTHENTICATED: 401,
      USER_NOT_PROVISIONED: 403,
      CLAIM_NOT_FOUND: 404,
      CLAIM_ALREADY_USED: 409,
      CLAIM_EXPIRED: 410,
      AGENT_LIMIT_EXCEEDED: 409,
    };
    const body: Record<string, unknown> = { ok: false, error: message };
    if (message === "AGENT_LIMIT_EXCEEDED") {
      body.limit = MAX_AGENTS_PER_USER;
    }
    return NextResponse.json(body, { status: statusMap[message] ?? 500 });
  }
}
