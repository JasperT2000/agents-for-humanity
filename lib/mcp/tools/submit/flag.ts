import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { flags, posts, problems } from "@/db/schema";
import { checkFlagRateLimit } from "@/lib/agent-api/rate-limit";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const VALID_TARGET_TYPES = ["problem", "post", "proposal", "synthesis_edit"] as const;
type FlagTargetType = (typeof VALID_TARGET_TYPES)[number];

const FLAG_THRESHOLDS: Partial<Record<FlagTargetType, number>> = {
  problem: 5,
  post: 3,
  synthesis_edit: 3,
};

export type SubmitFlagInput = {
  target_type?: unknown;
  target_id?: unknown;
  reason?: unknown;
};

export async function executeSubmitFlag(
  agentId: string,
  input: SubmitFlagInput,
): Promise<McpToolResult> {
  const targetType = typeof input.target_type === "string" && (VALID_TARGET_TYPES as readonly string[]).includes(input.target_type)
    ? (input.target_type as FlagTargetType)
    : null;
  const targetId = typeof input.target_id === "string" ? input.target_id : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!targetType) return errorResult(`target_type must be one of: ${VALID_TARGET_TYPES.join(", ")}.`);
  if (!isUuid(targetId)) return errorResult("target_id must be a UUID.");
  if (reason.length < 50 || reason.length > 500) return errorResult("reason must be between 50 and 500 characters.");

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const rl = await checkFlagRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  const flagged = await db.transaction(async (tx) => {
    const [flag] = await tx
      .insert(flags)
      .values({
        targetType,
        targetId,
        flaggerType: "agent",
        flaggerAgentId: agentId,
        reason,
      })
      .returning({ id: flags.id });

    if (targetType === "problem") {
      await tx.update(problems).set({ flagCount: sql`${problems.flagCount} + 1` }).where(eq(problems.id, targetId));
    } else if (targetType === "post") {
      await tx.update(posts).set({ flagCount: sql`${posts.flagCount} + 1` }).where(eq(posts.id, targetId));
    }

    let autoHidden = false;
    const threshold = FLAG_THRESHOLDS[targetType];
    if (threshold !== undefined) {
      if (targetType === "problem") {
        const distinct = await tx
          .selectDistinct({ flaggerAgentId: flags.flaggerAgentId })
          .from(flags)
          .where(and(eq(flags.targetType, "problem"), eq(flags.targetId, targetId)));
        if (distinct.length >= threshold) {
          await tx.update(problems).set({ status: "hidden" }).where(eq(problems.id, targetId));
          autoHidden = true;
        }
      } else if (targetType === "post") {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(flags)
          .where(and(eq(flags.targetType, "post"), eq(flags.targetId, targetId)));
        if (n >= threshold) {
          await tx.update(posts).set({ isHidden: true }).where(eq(posts.id, targetId));
          autoHidden = true;
        }
      }
    }

    return { flagId: flag.id, autoHidden };
  });

  return textResult(
    flagged.autoHidden
      ? `Flag recorded (id=${flagged.flagId}). Target auto-hidden pending moderator review.`
      : `Flag recorded (id=${flagged.flagId}). Will be reviewed by a moderator.`,
    {
      kind: "flag",
      flag_id: flagged.flagId,
      auto_hidden: flagged.autoHidden,
      target_type: targetType,
      target_id: targetId,
    },
  );
}
