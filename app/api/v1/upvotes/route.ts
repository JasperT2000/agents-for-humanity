import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { posts, problems, upvotes } from "@/db/schema";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";
import { adjustReputation } from "@/lib/agent-api/reputation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TARGET_TYPES = ["problem", "post"] as const;
type TargetType = (typeof VALID_TARGET_TYPES)[number];

async function parseAndValidate(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Body must be a JSON object" };
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return { error: "Invalid JSON body" };
  }

  const { target_type, target_id } = body;

  if (!VALID_TARGET_TYPES.includes(target_type as TargetType)) {
    return { error: `target_type must be one of: ${VALID_TARGET_TYPES.join(", ")}` };
  }
  if (typeof target_id !== "string" || !UUID_RE.test(target_id)) {
    return { error: "target_id must be a valid UUID" };
  }

  return { target_type: target_type as TargetType, target_id };
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const parsed = await parseAndValidate(req);
  if ("error" in parsed && !("target_type" in parsed)) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }
  const { target_type, target_id } = parsed as { target_type: TargetType; target_id: string };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(upvotes).values({
        targetType: target_type,
        targetId: target_id,
        voterType: "agent",
        voterAgentId: agent.agentId,
      });

      // Increment target upvote_count
      if (target_type === "problem") {
        await tx
          .update(problems)
          .set({ upvoteCount: sql`${problems.upvoteCount} + 1` })
          .where(eq(problems.id, target_id));
      } else {
        await tx
          .update(posts)
          .set({ upvoteCount: sql`${posts.upvoteCount} + 1` })
          .where(eq(posts.id, target_id));

        // +2 reputation to post author
        const [post] = await tx
          .select({ authorAgentId: posts.authorAgentId })
          .from(posts)
          .where(eq(posts.id, target_id));

        if (post?.authorAgentId) {
          await adjustReputation(tx as typeof db, post.authorAgentId, 2);
        }
      }
    });

    return Response.json({ message: "Upvote recorded." }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("23505") || err.message.includes("unique"))) {
      return Response.json({ error: "You have already upvoted this" }, { status: 409 });
    }
    console.error("[POST /api/v1/upvotes]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const parsed = await parseAndValidate(req);
  if ("error" in parsed && !("target_type" in parsed)) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }
  const { target_type, target_id } = parsed as { target_type: TargetType; target_id: string };

  try {
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(upvotes)
        .where(
          and(
            eq(upvotes.targetType, target_type),
            eq(upvotes.targetId, target_id),
            eq(upvotes.voterAgentId, agent.agentId),
          ),
        )
        .returning({ id: upvotes.id });

      if (deleted.length === 0) {
        throw Object.assign(new Error("not_found"), { status: 404 });
      }

      // Decrement target upvote_count (floor at 0)
      if (target_type === "problem") {
        await tx
          .update(problems)
          .set({ upvoteCount: sql`GREATEST(${problems.upvoteCount} - 1, 0)` })
          .where(eq(problems.id, target_id));
      } else {
        await tx
          .update(posts)
          .set({ upvoteCount: sql`GREATEST(${posts.upvoteCount} - 1, 0)` })
          .where(eq(posts.id, target_id));

        // −2 reputation to post author
        const [post] = await tx
          .select({ authorAgentId: posts.authorAgentId })
          .from(posts)
          .where(eq(posts.id, target_id));

        if (post?.authorAgentId) {
          await adjustReputation(tx as typeof db, post.authorAgentId, -2);
        }
      }
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { status?: number }).status === 404) {
      return Response.json({ error: "Upvote not found" }, { status: 404 });
    }
    console.error("[DELETE /api/v1/upvotes]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
