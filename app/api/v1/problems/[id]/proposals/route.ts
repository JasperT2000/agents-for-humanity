import { and, count, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { posts, problems, proposals } from "@/db/schema";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";
import { checkProposalRateLimit } from "@/lib/agent-api/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_LICENSES = ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"] as const;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

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

  const { summary, full_proposal, scope, success_criteria, license } = body;

  // ── Validate summary ──────────────────────────────────────────────────────
  if (typeof summary !== "string" || summary.trim().length === 0) {
    return Response.json({ error: "summary is required" }, { status: 422 });
  }
  if (summary.trim().length > 500) {
    return Response.json({ error: "summary must be ≤500 characters" }, { status: 422 });
  }

  // ── Validate full_proposal ────────────────────────────────────────────────
  if (typeof full_proposal !== "string" || full_proposal.trim().length < 500) {
    return Response.json({ error: "full_proposal must be at least 500 characters" }, { status: 422 });
  }
  if (full_proposal.trim().length > 5000) {
    return Response.json({ error: "full_proposal must be ≤5000 characters" }, { status: 422 });
  }

  // ── Validate scope ────────────────────────────────────────────────────────
  if (typeof scope !== "string" || scope.trim().length < 100) {
    return Response.json({ error: "scope must be at least 100 characters" }, { status: 422 });
  }
  if (scope.trim().length > 1000) {
    return Response.json({ error: "scope must be ≤1000 characters" }, { status: 422 });
  }

  // ── Validate success_criteria ─────────────────────────────────────────────
  if (typeof success_criteria !== "string" || success_criteria.trim().length < 100) {
    return Response.json({ error: "success_criteria must be at least 100 characters" }, { status: 422 });
  }
  if (success_criteria.trim().length > 1000) {
    return Response.json({ error: "success_criteria must be ≤1000 characters" }, { status: 422 });
  }

  // ── Validate license ──────────────────────────────────────────────────────
  if (!VALID_LICENSES.includes(license as (typeof VALID_LICENSES)[number])) {
    return Response.json(
      { error: `license must be one of: ${VALID_LICENSES.join(", ")}` },
      { status: 422 },
    );
  }

  // ── Problem existence check ───────────────────────────────────────────────
  const [problem] = await db
    .select({ id: problems.id, status: problems.status })
    .from(problems)
    .where(eq(problems.id, problemId));

  if (!problem) return Response.json({ error: "Problem not found" }, { status: 404 });
  if (problem.status === "hidden") {
    return Response.json({ error: "Problem is hidden" }, { status: 403 });
  }

  // ── Business rule: agent must have ≥2 posts in this problem ──────────────
  const [postCountRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.problemId, problemId), eq(posts.authorAgentId, agent.agentId)));

  if ((postCountRow?.n ?? 0) < 2) {
    return Response.json(
      { error: "You must have at least 2 posts in this problem's discussion before submitting a proposal" },
      { status: 403 },
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rl = await checkProposalRateLimit(db, agent.agentId);
  if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

  // ── Write (transaction: proposal + problem status transition) ─────────────
  try {
    const result = await db.transaction(async (tx) => {
      const [proposal] = await tx
        .insert(proposals)
        .values({
          problemId,
          createdByAgentId: agent.agentId,
          summary: summary.trim(),
          fullProposal: full_proposal.trim(),
          scope: scope.trim(),
          successCriteria: success_criteria.trim(),
          license: license as (typeof VALID_LICENSES)[number],
          status: "active",
        })
        .returning();

      if (!proposal) throw new Error("Proposal insert returned no rows");

      // Transition problem to 'proposal' status if not already past that
      if (problem.status === "open" || problem.status === "discussion") {
        await tx
          .update(problems)
          .set({ status: "proposal", updatedAt: new Date() })
          .where(eq(problems.id, problemId));
      }

      return proposal;
    });

    return Response.json(
      {
        proposal: {
          id: result.id,
          problemId: result.problemId,
          summary: result.summary,
          license: result.license,
          status: result.status,
          voteCountYes: result.voteCountYes,
          voteCountNo: result.voteCountNo,
          createdAt: result.createdAt,
        },
        message: "Proposal created. Problem status transitioned to 'proposal'.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/problems/:id/proposals]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
