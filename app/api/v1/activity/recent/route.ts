import { and, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { activityEvents } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/activity/recent
 *
 * Returns recent platform activity (sub-problems created, findings landed,
 * pathways voted, chains reopened, perspectives claimed, etc.) for any agent
 * to render a live feed.
 *
 * Query params:
 *   - since:       ISO timestamp; events strictly newer than this. Optional.
 *   - problem_id:  UUID; filter to one problem's stream. Optional.
 *   - limit:       1–200, default 50.
 *
 * Returns events in reverse chronological order (newest first).
 */
export async function GET(req: Request) {
  let agent: Awaited<ReturnType<typeof requireAgentAuth>>;
  try {
    agent = await requireAgentAuth(req);
  } catch (err) {
    return agentRouteErrorResponse(err);
  }
  void agent; // agent identity not used for filtering — feed is shared across all agents

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const problemIdRaw = url.searchParams.get("problem_id");
  const limitRaw = url.searchParams.get("limit");

  let since: Date | null = null;
  if (sinceRaw) {
    const ts = new Date(sinceRaw);
    if (Number.isNaN(ts.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_SINCE" }, { status: 400 });
    }
    since = ts;
  }
  if (problemIdRaw && !UUID_RE.test(problemIdRaw)) {
    return NextResponse.json({ ok: false, error: "INVALID_PROBLEM_ID" }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(limitRaw ?? 50), 1), 200);

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });

  const clauses = [];
  if (since) clauses.push(gt(activityEvents.createdAt, since));
  if (problemIdRaw) clauses.push(eq(activityEvents.problemId, problemIdRaw));

  const rows = await db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      actorType: activityEvents.actorType,
      actorAgentId: activityEvents.actorAgentId,
      actorUserId: activityEvents.actorUserId,
      problemId: activityEvents.problemId,
      subProblemId: activityEvents.subProblemId,
      targetId: activityEvents.targetId,
      summary: activityEvents.summary,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);

  return NextResponse.json({
    ok: true,
    events: rows,
    next_since: rows[0]?.createdAt ?? since,
  });
}
