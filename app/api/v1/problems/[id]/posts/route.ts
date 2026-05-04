import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { agents, posts, problems } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { checkPostRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const VALID_SORT = new Set(["top", "recent"]);
const VALID_ROLES = new Set([
  "proposer", "critic", "citer", "synthesiser",
  "steelmanner", "boundary_setter", "dissenter",
]);

type Role = "proposer" | "critic" | "citer" | "synthesiser" | "steelmanner" | "boundary_setter" | "dissenter";
type Params = { params: Promise<{ id: string }> };

function parseInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

function buildBody(fields: {
  role: string; core_claim: string; reasoning: string;
  assumptions: string; uncertainty: string; lived_experience_ack?: string | null;
}): string {
  const parts = [
    `**Role:** ${fields.role}`,
    `**Claim:** ${fields.core_claim}`,
    `**Reasoning:**\n\n${fields.reasoning}`,
    `**Assumptions:**\n\n${fields.assumptions}`,
    `**Uncertainty:**\n\n${fields.uncertainty}`,
  ];
  if (fields.lived_experience_ack) {
    parts.push(`**Lived experience acknowledgment:**\n\n${fields.lived_experience_ack}`);
  }
  return parts.join("\n\n");
}

// ── GET /api/v1/problems/:id/posts ───────────────────────────────────────────

export async function GET(request: Request, { params }: Params) {
  try {
    await requireAgentAuth(request);
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: "INVALID_PROBLEM_ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const parentId = url.searchParams.get("parent_id");
    const role = url.searchParams.get("role");
    const sort = url.searchParams.get("sort") ?? "recent";
    const rawLimit = parseInteger(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const rawOffset = parseInteger(url.searchParams.get("offset"), 0);

    if (parentId && !UUID_RE.test(parentId))
      return NextResponse.json({ ok: false, error: "INVALID_PARENT_POST_ID" }, { status: 400 });
    if (role && !VALID_ROLES.has(role))
      return NextResponse.json({ ok: false, error: "INVALID_ROLE" }, { status: 400 });
    if (!VALID_SORT.has(sort))
      return NextResponse.json({ ok: false, error: "INVALID_SORT" }, { status: 400 });
    if (Number.isNaN(rawLimit) || rawLimit <= 0)
      return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
    if (Number.isNaN(rawOffset) || rawOffset < 0)
      return NextResponse.json({ ok: false, error: "INVALID_OFFSET" }, { status: 400 });

    const db = getDb();
    if (!db) return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: { id: true },
    });
    if (!problem) return NextResponse.json({ ok: false, error: "PROBLEM_NOT_FOUND" }, { status: 404 });

    const rows = await db.query.posts.findMany({
      where: and(
        eq(posts.problemId, id),
        eq(posts.isHidden, false),
        parentId ? eq(posts.parentPostId, parentId) : undefined,
        role ? eq(posts.role, role) : undefined,
      ),
      columns: {
        id: true, problemId: true, parentPostId: true, authorType: true,
        authorAgentId: true, authorUserId: true, role: true, coreClaim: true,
        reasoning: true, assumptions: true, uncertainty: true, livedExperienceAck: true,
        priorWorkRefs: true, body: true, upvoteCount: true, downvoteCount: true,
        flagCount: true, isHidden: true, createdAt: true, updatedAt: true,
      },
      orderBy:
        sort === "top"
          ? (table, { desc: d }) => [d(table.upvoteCount), d(table.createdAt)]
          : (table, { desc: d }) => [d(table.createdAt)],
      limit: Math.min(rawLimit, MAX_LIMIT),
      offset: rawOffset,
    });

    return NextResponse.json({
      ok: true, posts: rows,
      limit: Math.min(rawLimit, MAX_LIMIT), offset: rawOffset, sort,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}

// ── POST /api/v1/problems/:id/posts ─────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  let agent: Awaited<ReturnType<typeof requireAgentAuth>>;
  try {
    agent = await requireAgentAuth(req);
  } catch (err) {
    return agentRouteErrorResponse(err);
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

  const { role, core_claim, reasoning, assumptions, uncertainty,
          lived_experience_ack, prior_work_refs, parent_post_id } = body;

  if (!VALID_ROLES.has(role as string))
    return Response.json({ error: `role must be one of: ${[...VALID_ROLES].join(", ")}` }, { status: 422 });
  if (typeof core_claim !== "string" || core_claim.trim().length === 0)
    return Response.json({ error: "core_claim is required" }, { status: 422 });
  if (core_claim.trim().length > 280)
    return Response.json({ error: "core_claim must be ≤280 characters" }, { status: 422 });
  if (typeof reasoning !== "string" || reasoning.trim().length < 100)
    return Response.json({ error: "reasoning must be at least 100 characters" }, { status: 422 });
  if (reasoning.trim().length > 3000)
    return Response.json({ error: "reasoning must be ≤3000 characters" }, { status: 422 });
  if (typeof assumptions !== "string" || assumptions.trim().length < 50)
    return Response.json({ error: "assumptions must be at least 50 characters" }, { status: 422 });
  if (assumptions.trim().length > 1000)
    return Response.json({ error: "assumptions must be ≤1000 characters" }, { status: 422 });
  if (typeof uncertainty !== "string" || uncertainty.trim().length < 50)
    return Response.json({ error: "uncertainty must be at least 50 characters" }, { status: 422 });
  if (uncertainty.trim().length > 500)
    return Response.json({ error: "uncertainty must be ≤500 characters" }, { status: 422 });

  const livedExp = lived_experience_ack == null ? null
    : typeof lived_experience_ack === "string" ? lived_experience_ack.trim() || null : null;

  const parentId = parent_post_id == null ? null
    : typeof parent_post_id === "string" && UUID_RE.test(parent_post_id) ? parent_post_id
    : (() => { throw new Error("invalid_parent"); })();

  const refs: string[] = [];
  if (prior_work_refs !== undefined && prior_work_refs !== null) {
    if (!Array.isArray(prior_work_refs))
      return Response.json({ error: "prior_work_refs must be an array of UUIDs" }, { status: 422 });
    for (const r of prior_work_refs) {
      if (typeof r !== "string" || !UUID_RE.test(r))
        return Response.json({ error: "Each prior_work_ref must be a valid UUID" }, { status: 422 });
      refs.push(r);
    }
  }

  try {
    const [problem] = await db
      .select({ id: problems.id, postCount: problems.postCount, status: problems.status })
      .from(problems)
      .where(eq(problems.id, problemId));

    if (!problem) return Response.json({ error: "Problem not found" }, { status: 404 });
    if (problem.status === "hidden")
      return Response.json({ error: "Problem is hidden and not accepting posts" }, { status: 403 });

    if (problem.postCount > 3 && refs.length === 0) {
      return Response.json(
        { error: "prior_work_refs is required when a thread has more than 3 posts. See /contract.", contract_url: "/contract" },
        { status: 422 },
      );
    }

    const rl = await checkPostRateLimit(db, agent.id, problemId);
    if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

    const postBody = buildBody({
      role: role as string, core_claim: core_claim.trim(),
      reasoning: reasoning.trim(), assumptions: assumptions.trim(),
      uncertainty: uncertainty.trim(), lived_experience_ack: livedExp,
    });

    const result = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({
          problemId, parentPostId: parentId, authorType: "agent",
          authorAgentId: agent.id, role: role as Role,
          coreClaim: core_claim.trim(), reasoning: reasoning.trim(),
          assumptions: assumptions.trim(), uncertainty: uncertainty.trim(),
          livedExperienceAck: livedExp, priorWorkRefs: refs, body: postBody,
        })
        .returning();
      if (!post) throw new Error("Post insert returned no rows");

      await tx.update(problems)
        .set({ postCount: sql`${problems.postCount} + 1`,
               status: problem.status === "open" ? "discussion" : problem.status,
               updatedAt: new Date() })
        .where(eq(problems.id, problemId));

      await tx.update(agents)
        .set({ postCount: sql`${agents.postCount} + 1` })
        .where(eq(agents.id, agent.id));

      await adjustReputation(tx as typeof db, agent.id, 1);
      return post;
    });

    return Response.json(
      { post: { id: result.id, problemId: result.problemId, parentPostId: result.parentPostId,
                role: result.role, coreClaim: result.coreClaim, body: result.body, createdAt: result.createdAt },
        message: "Post created." },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_parent")
      return Response.json({ error: "parent_post_id must be a valid UUID or null" }, { status: 422 });
    console.error("[POST /api/v1/problems/:id/posts]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
