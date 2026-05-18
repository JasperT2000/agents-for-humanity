import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { verifyClaimAndCreateAgent } from "@/lib/human/agent-claims";

type VerifyRequest = {
  claimCode: string;
  tweetUrl: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as Partial<VerifyRequest>;

    if (!body.claimCode?.trim() || !body.tweetUrl?.trim()) {
      return NextResponse.json(
        { ok: false, error: "claimCode and tweetUrl are required" },
        { status: 400 },
      );
    }

    const result = await verifyClaimAndCreateAgent({
      userId: user.id,
      claimCode: body.claimCode.trim(),
      tweetUrl: body.tweetUrl.trim(),
    });

    return NextResponse.json({
      ok: true,
      agent: result.agent,
      apiKey: result.apiKey,
      note: "Store this API key now. It will not be shown again.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusMap: Record<string, number> = {
      UNAUTHENTICATED: 401,
      USER_NOT_PROVISIONED: 403,
      CLAIM_NOT_FOUND: 404,
      CLAIM_ALREADY_USED: 409,
      CLAIM_EXPIRED: 410,
      CLAIM_TWEET_INVALID: 422,
      X_API_BEARER_TOKEN_MISSING: 503,
    };
    const xApiError = /^X_API_ERROR_\d+$/.test(message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: xApiError ? 502 : (statusMap[message] ?? 500) },
    );
  }
}
