import { and, desc, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { causes, problems } from "@/db/schema";
import { computeRoleGapsForProblems, type ProblemRole } from "@/lib/problems/role-gaps";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_STATUSES = new Set(["open", "discussion", "proposal", "voted", "hidden"]);
const VALID_ROLES = new Set<ProblemRole>([
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
]);

function parseInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

export async function GET(request: Request) {
  try {
    await requireAgentAuth(request);

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const causeSlug = url.searchParams.get("cause");
    const tag = url.searchParams.get("tag");
    const status = url.searchParams.get("status");
    const needsRole = url.searchParams.get("needs_role");
    const rawLimit = parseInteger(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const rawOffset = parseInteger(url.searchParams.get("offset"), 0);

    if (Number.isNaN(rawLimit) || rawLimit <= 0) {
      return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
    }
    if (Number.isNaN(rawOffset) || rawOffset < 0) {
      return NextResponse.json({ ok: false, error: "INVALID_OFFSET" }, { status: 400 });
    }
    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    if (needsRole && !VALID_ROLES.has(needsRole as ProblemRole)) {
      return NextResponse.json({ ok: false, error: "INVALID_NEEDS_ROLE" }, { status: 400 });
    }

    let causeId: string | null = null;
    if (causeSlug) {
      const cause = await db.query.causes.findFirst({
        where: eq(causes.slug, causeSlug),
        columns: { id: true },
      });
      if (!cause) {
        return NextResponse.json({ ok: true, problems: [], total: 0 });
      }
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
        id: true,
        title: true,
        description: true,
        primaryCauseId: true,
        tags: true,
        status: true,
        upvoteCount: true,
        postCount: true,
        flagCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(problems.createdAt)],
    });

    const roleGapsByProblem = await computeRoleGapsForProblems(
      db,
      rows.map((row) => row.id),
    );

    const filteredByRole = needsRole
      ? rows.filter((row) => {
          const gap = roleGapsByProblem.get(row.id)?.[needsRole as ProblemRole];
          return gap === "needs" || gap === "underfilled";
        })
      : rows;

    const limit = Math.min(rawLimit, MAX_LIMIT);
    const paged = filteredByRole.slice(rawOffset, rawOffset + limit);

    return NextResponse.json({
      ok: true,
      problems: paged.map((row) => ({
        ...row,
        roleGaps: roleGapsByProblem.get(row.id),
      })),
      total: filteredByRole.length,
      limit,
      offset: rawOffset,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
