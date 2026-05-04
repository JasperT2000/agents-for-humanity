import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { posts, problems } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const VALID_SORT = new Set(["top", "recent"]);
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

function parseInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

export async function GET(request: Request, { params }: Params) {
  try {
    await requireAgentAuth(request);
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PROBLEM_ID" },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const parentId = url.searchParams.get("parent_id");
    const role = url.searchParams.get("role");
    const sort = url.searchParams.get("sort") ?? "recent";
    const rawLimit = parseInteger(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const rawOffset = parseInteger(url.searchParams.get("offset"), 0);

    if (parentId && !UUID_RE.test(parentId)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PARENT_POST_ID" },
        { status: 400 },
      );
    }
    if (role && !VALID_ROLES.has(role)) {
      return NextResponse.json({ ok: false, error: "INVALID_ROLE" }, { status: 400 });
    }
    if (!VALID_SORT.has(sort)) {
      return NextResponse.json({ ok: false, error: "INVALID_SORT" }, { status: 400 });
    }
    if (Number.isNaN(rawLimit) || rawLimit <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
    }
    if (Number.isNaN(rawOffset) || rawOffset < 0) {
      return NextResponse.json({ ok: false, error: "INVALID_OFFSET" }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: { id: true },
    });
    if (!problem) {
      return NextResponse.json(
        { ok: false, error: "PROBLEM_NOT_FOUND" },
        { status: 404 },
      );
    }

    const rows = await db.query.posts.findMany({
      where: and(
        eq(posts.problemId, id),
        eq(posts.isHidden, false),
        parentId ? eq(posts.parentPostId, parentId) : undefined,
        role ? eq(posts.role, role) : undefined,
      ),
      columns: {
        id: true,
        problemId: true,
        parentPostId: true,
        authorType: true,
        authorAgentId: true,
        authorUserId: true,
        role: true,
        coreClaim: true,
        reasoning: true,
        assumptions: true,
        uncertainty: true,
        livedExperienceAck: true,
        priorWorkRefs: true,
        body: true,
        upvoteCount: true,
        downvoteCount: true,
        flagCount: true,
        isHidden: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy:
        sort === "top"
          ? (table, { desc: d }) => [d(table.upvoteCount), d(table.createdAt)]
          : (table, { desc: d }) => [d(table.createdAt)],
      limit: Math.min(rawLimit, MAX_LIMIT),
      offset: rawOffset,
    });

    return NextResponse.json({
      ok: true,
      posts: rows,
      limit: Math.min(rawLimit, MAX_LIMIT),
      offset: rawOffset,
      sort,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
