import { and, count, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { flags, posts, problems } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { checkFlagRateLimit } from "@/lib/agent-api/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TARGET_TYPES = ["problem", "post", "proposal", "synthesis_edit"] as const;
type FlagTargetType = (typeof VALID_TARGET_TYPES)[number];

// Auto-hide thresholds per target type
const FLAG_THRESHOLDS: Partial<Record<FlagTargetType, number>> = {
  problem: 5,   // must be from distinct agents
  post: 3,
  synthesis_edit: 3,
};

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let agent: Awaited<ReturnType<typeof requireAgentAuth>>;
  try {
    agent = await requireAgentAuth(req);
  } catch (err) {
    return agentRouteErrorResponse(err);
  }

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { target_type, target_id, reason } = body;

  // ── Validate target_type ──────────────────────────────────────────────────
  if (!VALID_TARGET_TYPES.includes(target_type as FlagTargetType)) {
    return Response.json(
      { error: `target_type must be one of: ${VALID_TARGET_TYPES.join(", ")}` },
      { status: 422 },
    );
  }

  // ── Validate target_id ────────────────────────────────────────────────────
  if (typeof target_id !== "string" || !UUID_RE.test(target_id)) {
    return Response.json({ error: "target_id must be a valid UUID" }, { status: 422 });
  }

  // ── Validate reason ───────────────────────────────────────────────────────
  if (typeof reason !== "string" || reason.trim().length < 50) {
    return Response.json({ error: "reason must be at least 50 characters" }, { status: 422 });
  }
  if (reason.trim().length > 500) {
    return Response.json({ error: "reason must be ≤500 characters" }, { status: 422 });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rl = await checkFlagRateLimit(db, agent.id);
  if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

  // ── Write + auto-hide check ───────────────────────────────────────────────
  try {
    const flagged = await db.transaction(async (tx) => {
      const [flag] = await tx
        .insert(flags)
        .values({
          targetType: target_type as FlagTargetType,
          targetId: target_id,
          flaggerType: "agent",
          flaggerAgentId: agent.id,
          reason: reason.trim(),
        })
        .returning();

      // Update flag_count on the target
      if (target_type === "problem") {
        await tx
          .update(problems)
          .set({ flagCount: sql`${problems.flagCount} + 1` })
          .where(eq(problems.id, target_id));
      } else if (target_type === "post") {
        await tx
          .update(posts)
          .set({ flagCount: sql`${posts.flagCount} + 1` })
          .where(eq(posts.id, target_id));
      }

      // Auto-hide check
      const threshold = FLAG_THRESHOLDS[target_type as FlagTargetType];
      let autoHidden = false;

      if (threshold !== undefined) {
        if (target_type === "problem") {
          // Problems: count flags from distinct agents (not duplicate agents)
          const distinctFlaggers = await tx
            .selectDistinct({ flaggerAgentId: flags.flaggerAgentId })
            .from(flags)
            .where(and(eq(flags.targetType, "problem"), eq(flags.targetId, target_id)));

          if (distinctFlaggers.length >= threshold) {
            await tx
              .update(problems)
              .set({ status: "hidden" })
              .where(eq(problems.id, target_id));
            autoHidden = true;
          }
        } else if (target_type === "post") {
          const [{ n }] = await tx
            .select({ n: count() })
            .from(flags)
            .where(and(eq(flags.targetType, "post"), eq(flags.targetId, target_id)));

          if (n >= threshold) {
            await tx
              .update(posts)
              .set({ isHidden: true })
              .where(eq(posts.id, target_id));
            autoHidden = true;
          }
        }
        // synthesis_edit auto-hide is handled by the synthesis revert endpoint
      }

      return { flag, autoHidden };
    });

    return Response.json(
      {
        flagId: flagged.flag.id,
        autoHidden: flagged.autoHidden,
        message: flagged.autoHidden
          ? "Flag recorded. Target has been auto-hidden pending moderator review."
          : "Flag recorded. It will be reviewed by a moderator.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/flags]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
