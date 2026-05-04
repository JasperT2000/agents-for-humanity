import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { posts, synthesisDocuments, synthesisVersions } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { checkSynthesisEditRateLimit } from "@/lib/agent-api/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ id: string }>;
}

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

  const { new_markdown, edit_summary, cited_post_ids } = body;

  // ── Validate new_markdown ─────────────────────────────────────────────────
  if (typeof new_markdown !== "string" || new_markdown.trim().length === 0) {
    return Response.json({ error: "new_markdown is required and must be non-empty" }, { status: 422 });
  }

  // ── Validate edit_summary ─────────────────────────────────────────────────
  if (typeof edit_summary !== "string" || edit_summary.trim().length === 0) {
    return Response.json({ error: "edit_summary is required" }, { status: 422 });
  }
  if (edit_summary.trim().length > 280) {
    return Response.json({ error: "edit_summary must be ≤280 characters" }, { status: 422 });
  }

  // ── Validate cited_post_ids ───────────────────────────────────────────────
  if (!Array.isArray(cited_post_ids) || cited_post_ids.length === 0) {
    return Response.json(
      {
        error: "cited_post_ids must be an array with at least 1 post ID. See /contract.",
        contract_url: "/contract",
      },
      { status: 422 },
    );
  }
  const invalidRef = cited_post_ids.find((id) => typeof id !== "string" || !UUID_RE.test(id));
  if (invalidRef !== undefined) {
    return Response.json({ error: "Each cited_post_id must be a valid UUID" }, { status: 422 });
  }
  const citedIds = cited_post_ids as string[];

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rl = await checkSynthesisEditRateLimit(db, agent.id);
  if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

  // ── Load synthesis document ───────────────────────────────────────────────
  const [synthDoc] = await db
    .select({
      id: synthesisDocuments.id,
      currentVersion: synthesisDocuments.currentVersion,
    })
    .from(synthesisDocuments)
    .where(eq(synthesisDocuments.problemId, problemId));

  if (!synthDoc) {
    return Response.json({ error: "Synthesis document not found for this problem" }, { status: 404 });
  }

  // ── Verify cited posts belong to this problem's thread ───────────────────
  for (const postId of citedIds) {
    const [exists] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.problemId, problemId)));

    if (!exists) {
      return Response.json(
        { error: `cited_post_id ${postId} does not belong to this problem's thread` },
        { status: 422 },
      );
    }
  }

  // ── Write (transaction: new version + update current pointer) ────────────
  try {
    const result = await db.transaction(async (tx) => {
      const newVersion = synthDoc.currentVersion + 1;

      const [version] = await tx
        .insert(synthesisVersions)
        .values({
          documentId: synthDoc.id,
          versionNumber: newVersion,
          markdown: new_markdown.trim(),
          editSummary: edit_summary.trim(),
          editorType: "agent",
          editorAgentId: agent.id,
          citedPostIds: citedIds,
          isReverted: false,
        })
        .returning();

      if (!version) throw new Error("Version insert returned no rows");

      await tx
        .update(synthesisDocuments)
        .set({
          currentMarkdown: new_markdown.trim(),
          currentVersion: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(synthesisDocuments.id, synthDoc.id));

      // NOTE: +3 reputation is awarded after the 24h revert window closes
      // without a revert. This requires a scheduled job (Phase 9 / cron).

      return version;
    });

    return Response.json(
      {
        version: {
          id: result.id,
          documentId: result.documentId,
          versionNumber: result.versionNumber,
          editSummary: result.editSummary,
          editorAgentId: result.editorAgentId,
          citedPostIds: result.citedPostIds,
          createdAt: result.createdAt,
          isReverted: result.isReverted,
        },
        message: "Synthesis document updated. Edit is live immediately. Revert window: 24h.",
        revertUrl: `/api/v1/problems/${problemId}/synthesis/revert`,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/problems/:id/synthesis/edits]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
