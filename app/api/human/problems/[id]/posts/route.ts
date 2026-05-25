import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { posts, problems, subProblems } from "@/db/schema";
import { requireHumanAuth } from "@/lib/human-auth";
import { markPerspectiveFilled, resolveOwnedPerspective } from "@/lib/perspectives/manage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_ROLES = new Set([
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
]);

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/human/problems/[id]/posts
 *
 * Humans contribute to a problem. The minimum shape is { body } — freeform
 * testimony like the brief's caseworker case. Phase 2 adds optional
 * structured fields and attribution: role, perspective_id, sub_problem_id,
 * parent_post_id, prior_work_refs. Backward-compatible: existing
 * { body }-only callers keep working.
 */
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

  // Field unpacking
  const bodyText = typeof body.body === "string" ? body.body.trim() : "";
  const coreClaim = typeof body.core_claim === "string" ? body.core_claim.trim() : "";
  const reasoning = typeof body.reasoning === "string" ? body.reasoning.trim() || null : null;
  const assumptions = typeof body.assumptions === "string" ? body.assumptions.trim() || null : null;
  const uncertainty = typeof body.uncertainty === "string" ? body.uncertainty.trim() || null : null;
  const livedExp = typeof body.lived_experience_ack === "string" ? body.lived_experience_ack.trim() || null : null;
  const roleRaw = typeof body.role === "string" ? body.role : null;
  const subProblemIdRaw = typeof body.sub_problem_id === "string" ? body.sub_problem_id : null;
  const perspectiveIdRaw = typeof body.perspective_id === "string" ? body.perspective_id : null;
  const parentIdRaw = typeof body.parent_post_id === "string" ? body.parent_post_id : null;

  const refs: string[] = [];
  if (Array.isArray(body.prior_work_refs)) {
    for (const r of body.prior_work_refs) {
      if (typeof r !== "string" || !UUID_RE.test(r)) {
        return Response.json({ error: "Each prior_work_ref must be a valid UUID" }, { status: 422 });
      }
      refs.push(r);
    }
  } else if (body.prior_work_refs != null) {
    return Response.json({ error: "prior_work_refs must be an array of UUIDs" }, { status: 422 });
  }

  // Validation
  if (!bodyText && !coreClaim) {
    return Response.json({ error: "Either body (freeform) or core_claim is required" }, { status: 422 });
  }
  if (coreClaim && coreClaim.length > 280) {
    return Response.json({ error: "core_claim must be ≤280 characters" }, { status: 422 });
  }
  if (bodyText && bodyText.length > 8000) {
    return Response.json({ error: "body must be ≤8000 characters" }, { status: 422 });
  }
  if (roleRaw !== null && !VALID_ROLES.has(roleRaw)) {
    return Response.json(
      { error: `role must be one of: ${[...VALID_ROLES].join(", ")}, or omitted` },
      { status: 422 },
    );
  }
  if (subProblemIdRaw !== null && !UUID_RE.test(subProblemIdRaw)) {
    return Response.json({ error: "sub_problem_id must be a valid UUID or omitted" }, { status: 422 });
  }
  if (perspectiveIdRaw !== null && !UUID_RE.test(perspectiveIdRaw)) {
    return Response.json({ error: "perspective_id must be a valid UUID or omitted" }, { status: 422 });
  }
  if (parentIdRaw !== null && !UUID_RE.test(parentIdRaw)) {
    return Response.json({ error: "parent_post_id must be a valid UUID or omitted" }, { status: 422 });
  }

  try {
    const [problem] = await db
      .select({ id: problems.id, status: problems.status, postCount: problems.postCount })
      .from(problems)
      .where(eq(problems.id, problemId));

    if (!problem) return Response.json({ error: "Problem not found" }, { status: 404 });
    if (problem.status === "hidden")
      return Response.json({ error: "Problem is hidden" }, { status: 403 });

    // Validate sub_problem_id belongs to this problem
    if (subProblemIdRaw !== null) {
      const sp = await db.query.subProblems.findFirst({
        where: and(eq(subProblems.id, subProblemIdRaw), eq(subProblems.problemId, problemId)),
        columns: { id: true },
      });
      if (!sp) {
        return Response.json(
          { error: "sub_problem_id does not belong to this problem" },
          { status: 422 },
        );
      }
    }

    // Validate perspective_id belongs to this problem AND is owned by this user
    if (perspectiveIdRaw !== null) {
      const pres = await resolveOwnedPerspective({
        perspectiveId: perspectiveIdRaw,
        problemId,
        ownerUserId: user.id,
      });
      if ("error" in pres) {
        const code = pres.error === "PERSPECTIVE_NOT_FOUND" ? 404 : 403;
        return Response.json(
          {
            error:
              pres.error === "PERSPECTIVE_NOT_FOUND"
                ? "perspective_id not found"
                : "perspective_id does not belong to this problem, or you don't hold it",
          },
          { status: code },
        );
      }
    }

    const result = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({
          problemId,
          parentPostId: parentIdRaw,
          subProblemId: subProblemIdRaw,
          perspectiveId: perspectiveIdRaw,
          authorType: "human",
          authorUserId: user.id,
          role: roleRaw,
          coreClaim: coreClaim || null,
          reasoning,
          assumptions,
          uncertainty,
          livedExperienceAck: livedExp,
          priorWorkRefs: refs,
          body: bodyText || coreClaim || null,
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

    if (perspectiveIdRaw !== null) {
      await markPerspectiveFilled(perspectiveIdRaw);
    }

    return Response.json(
      {
        ok: true,
        post: {
          id: result.id,
          problemId: result.problemId,
          subProblemId: result.subProblemId,
          perspectiveId: result.perspectiveId,
          role: result.role,
          body: result.body,
          createdAt: result.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/human/problems/:id/posts]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
