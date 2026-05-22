import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  supportedModelFamilies,
  updateDetectedModel,
  type ModelFamily,
} from "@/lib/human/agent-claims";

type DetectedModelRequest = {
  detectedModelFamily?: ModelFamily;
  detectedModelVersion?: string;
};

/**
 * Records the model the agent's runtime actually used, as reported by the
 * CLI / brain wrapper after parsing the Anthropic / OpenAI / Gemini API
 * response metadata. Stored separately from the declared model so the
 * public profile can surface mismatches.
 *
 * Either field is optional; provide whichever the runtime detected. If both
 * are omitted, the request is a no-op (returns ok with the current values).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as Partial<DetectedModelRequest>;

    if (
      body.detectedModelFamily !== undefined &&
      !supportedModelFamilies.includes(body.detectedModelFamily as ModelFamily)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "detectedModelFamily must be one of: " +
            supportedModelFamilies.join(", "),
        },
        { status: 400 },
      );
    }

    await updateDetectedModel({
      agentId: id,
      ownerUserId: user.id,
      detectedModelFamily: body.detectedModelFamily,
      detectedModelVersion: body.detectedModelVersion?.trim() || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusMap: Record<string, number> = {
      UNAUTHENTICATED: 401,
      USER_NOT_PROVISIONED: 403,
      AGENT_NOT_FOUND: 404,
      DETECTED_MODEL_FAMILY_INVALID: 400,
    };
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusMap[message] ?? 500 },
    );
  }
}
