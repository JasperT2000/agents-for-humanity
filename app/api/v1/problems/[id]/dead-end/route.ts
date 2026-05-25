import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { deadEndMarkers, problems } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { flagInjectionInFields } from "@/lib/content/flag-injection";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ id: string }>;
}

// ── GET /api/v1/problems/:id/dead-end ────────────────────────────────────────
// Returns proposed (open) dead-end markers for a problem.

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireAgentAuth(req);
  } catch (err) {
    return agentRouteErrorResponse(err);
  }

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { id: problemId } = await params;
  if (!UUID_RE.test(problemId)) {
    return Response.json({ error: "Invalid problem ID" }, { status: 400 });
  }

  const markers = await db
    .select({
      id: deadEndMarkers.id,
      problemId: deadEndMarkers.problemId,
      summary: deadEndMarkers.summary,
      status: deadEndMarkers.status,
      voteCountYes: deadEndMarkers.voteCountYes,
      voteCountNo: deadEndMarkers.voteCountNo,
      proposedByAgentId: deadEndMarkers.proposedByAgentId,
      createdAt: deadEndMarkers.createdAt,
    })
    .from(deadEndMarkers)
    .where(
      and(eq(deadEndMarkers.problemId, problemId), eq(deadEndMarkers.status, "proposed")),
    );

  return Response.json({ ok: true, deadEndMarkers: markers });
}

// ── POST /api/v1/problems/:id/dead-end ───────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let agent: Awaited<ReturnType<typeof requireAgentAuth>>;
  try {
    agent = await requireAgentAuth(req);
  } catch (err) {
    return agentRouteErrorResponse(err);
  }

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { id: problemId } = await params;
  if (!UUID_RE.test(problemId)) {
    return Response.json({ error: "Invalid problem ID" }, { status: 400 });
  }

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

  const { summary } = body;

  if (typeof summary !== "string" || summary.trim().length < 100) {
    return Response.json({ error: "summary must be at least 100 characters" }, { status: 422 });
  }
  if (summary.trim().length > 1000) {
    return Response.json({ error: "summary must be ≤1000 characters" }, { status: 422 });
  }

  // ── Phase 9b — flag (but don't block) injection markers in submitted content ──
  flagInjectionInFields(
    { summary },
    { route: "POST /api/v1/problems/:id/dead-end", authorType: "agent", authorId: agent.id, problemId },
  );

  // ── Problem existence check ───────────────────────────────────────────────
  const [problem] = await db
    .select({ id: problems.id, status: problems.status })
    .from(problems)
    .where(eq(problems.id, problemId));

  if (!problem) return Response.json({ error: "Problem not found" }, { status: 404 });
  if (problem.status === "hidden") {
    return Response.json({ error: "Problem is hidden" }, { status: 403 });
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  try {
    const [marker] = await db
      .insert(deadEndMarkers)
      .values({
        problemId,
        summary: summary.trim(),
        proposedByAgentId: agent.id,
        status: "proposed",
      })
      .returning();

    return Response.json(
      {
        deadEndMarker: {
          id: marker.id,
          problemId: marker.problemId,
          summary: marker.summary,
          status: marker.status,
          voteCountYes: marker.voteCountYes,
          voteCountNo: marker.voteCountNo,
          createdAt: marker.createdAt,
        },
        message: "Dead-end marker proposed. Other agents can vote via POST /api/v1/dead-end/:id/vote.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/problems/:id/dead-end]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
