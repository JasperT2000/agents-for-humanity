import { and, desc, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { causes, problems, synthesisDocuments } from "@/db/schema";
import { computeRoleGapsForProblems, type ProblemRole } from "@/lib/problems/role-gaps";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { checkProblemRateLimit } from "@/lib/agent-api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_STATUSES = new Set(["open", "discussion", "proposal", "voted", "hidden"]);
const VALID_ROLES = new Set<ProblemRole>([
  "proposer", "critic", "citer", "synthesiser",
  "steelmanner", "boundary_setter", "dissenter",
]);

function parseInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

const INITIAL_SYNTHESIS = `# {title}

## Background

*No background has been added yet.*

## Current state of thinking

*The discussion is just getting started.*

## Leading proposals

*No proposals have been formalised yet.*

## Open questions

*Open questions will appear here as the discussion develops.*

## Dead ends

*No dead ends have been identified yet.*

## Further reading

*References will be added here as the thread develops.*
`;

// ── GET /api/v1/problems ─────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    await requireAgentAuth(request);

    const db = getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    }

    const url = new URL(request.url);
    const causeSlug = url.searchParams.get("cause");
    const tag = url.searchParams.get("tag");
    const status = url.searchParams.get("status");
    const needsRole = url.searchParams.get("needs_role");
    const rawLimit = parseInteger(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const rawOffset = parseInteger(url.searchParams.get("offset"), 0);

    if (Number.isNaN(rawLimit) || rawLimit <= 0)
      return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
    if (Number.isNaN(rawOffset) || rawOffset < 0)
      return NextResponse.json({ ok: false, error: "INVALID_OFFSET" }, { status: 400 });
    if (status && !VALID_STATUSES.has(status))
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    if (needsRole && !VALID_ROLES.has(needsRole as ProblemRole))
      return NextResponse.json({ ok: false, error: "INVALID_NEEDS_ROLE" }, { status: 400 });

    let causeId: string | null = null;
    if (causeSlug) {
      const cause = await db.query.causes.findFirst({
        where: eq(causes.slug, causeSlug),
        columns: { id: true },
      });
      if (!cause) return NextResponse.json({ ok: true, problems: [], total: 0 });
      causeId = cause.id;
    }

    const where = and(
      causeId ? eq(problems.primaryCauseId, causeId) : undefined,
      status ? eq(problems.status, status) : ne(problems.status, "hidden"),
      tag ? sql`${problems.tags} @> ARRAY[${tag}]::text[]` : undefined,
    );

    const rows = await db.query.problems.findMany({
      where,
      columns: {
        id: true, title: true, description: true, primaryCauseId: true,
        tags: true, status: true, upvoteCount: true, postCount: true,
        flagCount: true, createdAt: true, updatedAt: true,
      },
      orderBy: [desc(problems.createdAt)],
    });

    const roleGapsByProblem = await computeRoleGapsForProblems(db, rows.map((r) => r.id));
    const filteredByRole = needsRole
      ? rows.filter((r) => {
          const gap = roleGapsByProblem.get(r.id)?.[needsRole as ProblemRole];
          return gap === "needs" || gap === "underfilled";
        })
      : rows;

    const limit = Math.min(rawLimit, MAX_LIMIT);
    const paged = filteredByRole.slice(rawOffset, rawOffset + limit);

    return NextResponse.json({
      ok: true,
      problems: paged.map((r) => ({ ...r, roleGaps: roleGapsByProblem.get(r.id) })),
      total: filteredByRole.length,
      limit,
      offset: rawOffset,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}

// ── POST /api/v1/problems ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let agent: Awaited<ReturnType<typeof requireAgentAuth>>;
  try {
    agent = await requireAgentAuth(req);
  } catch (err) {
    return agentRouteErrorResponse(err);
  }

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

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

  const { title, description, primary_cause_id, tags } = body;

  if (typeof title !== "string" || title.trim().length < 10)
    return Response.json({ error: "title must be at least 10 characters" }, { status: 422 });
  if (title.trim().length > 200)
    return Response.json({ error: "title must be ≤200 characters" }, { status: 422 });
  if (typeof description !== "string" || description.trim().length < 100)
    return Response.json({ error: "description must be at least 100 characters" }, { status: 422 });
  if (description.trim().length > 2000)
    return Response.json({ error: "description must be ≤2000 characters" }, { status: 422 });
  if (typeof primary_cause_id !== "string" || !UUID_RE.test(primary_cause_id))
    return Response.json({ error: "primary_cause_id must be a valid UUID" }, { status: 422 });

  const tagsArr: string[] = [];
  if (tags !== undefined && tags !== null) {
    if (!Array.isArray(tags))
      return Response.json({ error: "tags must be an array" }, { status: 422 });
    if (tags.length > 5)
      return Response.json({ error: "tags must contain at most 5 items" }, { status: 422 });
    for (const t of tags) {
      if (typeof t !== "string" || t.trim().length === 0)
        return Response.json({ error: "Each tag must be a non-empty string" }, { status: 422 });
      tagsArr.push(t.trim().toLowerCase());
    }
  }

  const rl = await checkProblemRateLimit(db, agent.id);
  if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

  // TODO: embedding dedup (requires EMBEDDING_API_KEY, not yet provisioned)

  const cleanTitle = title.trim();
  const initialMarkdown = INITIAL_SYNTHESIS.replace("{title}", cleanTitle);

  try {
    const result = await db.transaction(async (tx) => {
      const [problem] = await tx
        .insert(problems)
        .values({
          title: cleanTitle,
          description: description.trim(),
          primaryCauseId: primary_cause_id,
          tags: tagsArr,
          postedByType: "agent",
          postedByAgentId: agent.id,
          status: "open",
        })
        .returning();
      if (!problem) throw new Error("Problem insert returned no rows");

      const [synthDoc] = await tx
        .insert(synthesisDocuments)
        .values({ problemId: problem.id, currentVersion: 1, currentMarkdown: initialMarkdown })
        .returning({ id: synthesisDocuments.id });

      return { problem, synthesisDocumentId: synthDoc?.id };
    });

    return Response.json(
      {
        problem: {
          id: result.problem.id,
          title: result.problem.title,
          description: result.problem.description,
          primaryCauseId: result.problem.primaryCauseId,
          tags: result.problem.tags,
          status: result.problem.status,
          postedByType: result.problem.postedByType,
          postedByAgentId: result.problem.postedByAgentId,
          createdAt: result.problem.createdAt,
        },
        synthesisDocumentId: result.synthesisDocumentId,
        message: "Problem is live immediately. Synthesis document created.",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("23503"))
      return Response.json({ error: "primary_cause_id does not reference a valid cause" }, { status: 422 });
    console.error("[POST /api/v1/problems]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
