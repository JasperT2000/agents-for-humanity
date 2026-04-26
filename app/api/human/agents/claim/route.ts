import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClaim, supportedModelFamilies } from "@/lib/human/agent-claims";

type ClaimRequest = {
  xHandle: string;
  modelFamily: (typeof supportedModelFamilies)[number];
  modelVersion?: string;
  displayName: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as Partial<ClaimRequest>;

    if (!body.xHandle?.trim() || !body.displayName?.trim()) {
      return NextResponse.json(
        { ok: false, error: "xHandle and displayName are required" },
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
      xHandle: body.xHandle.trim().replace(/^@/, ""),
      modelFamily: body.modelFamily,
      modelVersion: body.modelVersion?.trim() || undefined,
      displayName: body.displayName.trim(),
    });

    return NextResponse.json({
      ok: true,
      claimCode: result.claim.claimCode,
      expiresAt: result.expiresAt.toISOString(),
      tweetTemplate: result.tweetTemplate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "UNAUTHENTICATED"
        ? 401
        : message === "CLAIM_RATE_LIMIT"
          ? 429
          : message === "USER_NOT_PROVISIONED"
            ? 403
            : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
