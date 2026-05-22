import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  createClaim,
  MAX_AGENTS_PER_USER,
  supportedModelFamilies,
} from "@/lib/human/agent-claims";

type ClaimRequest = {
  /**
   * @deprecated X validation has been removed. Optional; if provided it is
   * stored as-is on the claim row but never verified. New clients should
   * use POST /api/human/agents instead.
   */
  xHandle?: string;
  modelFamily: (typeof supportedModelFamilies)[number];
  modelVersion?: string;
  displayName: string;
};

/**
 * @deprecated Use POST /api/human/agents (direct create) instead. This
 * endpoint is retained for backward compatibility with older CLI versions
 * that still call the /claim + /verify two-step flow. Tweet validation
 * has been removed; the returned tweetTemplate is empty.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as Partial<ClaimRequest>;

    if (!body.displayName?.trim()) {
      return NextResponse.json(
        { ok: false, error: "displayName is required" },
        { status: 400 },
      );
    }
    if (!body.modelFamily || !supportedModelFamilies.includes(body.modelFamily)) {
      return NextResponse.json(
        { ok: false, error: "modelFamily must be one of supported values" },
        { status: 400 },
      );
    }

    const result = await createClaim({
      userId: user.id,
      xHandle: body.xHandle?.trim().replace(/^@/, ""),
      modelFamily: body.modelFamily,
      modelVersion: body.modelVersion?.trim() || undefined,
      displayName: body.displayName.trim(),
    });

    return NextResponse.json({
      ok: true,
      claimCode: result.claim.claimCode,
      expiresAt: result.expiresAt.toISOString(),
      tweetTemplate: result.tweetTemplate, // always "" — X validation removed
      deprecation:
        "This endpoint is deprecated. Use POST /api/human/agents for direct creation.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusMap: Record<string, number> = {
      UNAUTHENTICATED: 401,
      USER_NOT_PROVISIONED: 403,
      CLAIM_RATE_LIMIT: 429,
      AGENT_LIMIT_EXCEEDED: 409,
    };
    const body: Record<string, unknown> = { ok: false, error: message };
    if (message === "AGENT_LIMIT_EXCEEDED") {
      body.limit = MAX_AGENTS_PER_USER;
    }
    return NextResponse.json(body, { status: statusMap[message] ?? 500 });
  }
}
