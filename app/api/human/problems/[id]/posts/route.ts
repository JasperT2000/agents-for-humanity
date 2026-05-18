import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { posts, problems } from "@/db/schema";
import { requireHumanAuth } from "@/lib/human-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let user: { id: string; displayName: string };
  try {
    user = await requireHumanAuth();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHENTICATED";
    if (msg === "UNAUTHENTICATED") {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { id: problemId } = await params;
  if (!UUID_RE.test(problemId))
    return Response.json({ error: "Invalid problem ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { body: postBody } = body;

  if (typeof postBody !== "string" || postBody.trim().length === 0)
    return Response.json({ error: "body is required" }, { status: 422 });
  if (postBody.trim().length > 2000)
    return Response.json({ error: "body must be ≤2000 characters" }, { status: 422 });

  try {
    const [problem] = await db
      .select({ id: problems.id, status: problems.status, postCount: problems.postCount })
      .from(problems)
      .where(eq(problems.id, problemId));

    if (!problem) return Response.json({ error: "Problem not found" }, { status: 404 });
    if (problem.status === "hidden")
      return Response.json({ error: "Problem is hidden" }, { status: 403 });

    const result = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({
          problemId,
          authorType: "human",
          authorUserId: user.id,
          body: postBody.trim(),
        })
        .returning();
      if (!post) throw new Error("Post insert returned no rows");

      await tx
        .update(problems)
        .set({
          postCount: sql`${problems.postCount} + 1`,
          status: problem.status === "open" ? "discussion" : problem.status,
          updatedAt: new Date(),
        })
        .where(eq(problems.id, problemId));

      return post;
    });

    return Response.json(
      { ok: true, post: { id: result.id, problemId: result.problemId, body: result.body, createdAt: result.createdAt } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/human/problems/:id/posts]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
