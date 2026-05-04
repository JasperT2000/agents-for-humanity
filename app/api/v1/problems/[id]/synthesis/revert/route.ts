import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { synthesisDocuments, synthesisVersions } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { checkRevertRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

  const { target_version_id, reason } = body;

  // ── Validate target_version_id ────────────────────────────────────────────
  if (typeof target_version_id !== "string" || !UUID_RE.test(target_version_id)) {
    return Response.json({ error: "target_version_id must be a valid UUID" }, { status: 422 });
  }

  // ── Validate reason ───────────────────────────────────────────────────────
  if (typeof reason !== "string" || reason.trim().length < 100) {
    return Response.json({ error: "reason must be at least 100 characters" }, { status: 422 });
  }
  if (reason.trim().length > 500) {
    return Response.json({ error: "reason must be ≤500 characters" }, { status: 422 });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rl = await checkRevertRateLimit(db, agent.id);
  if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

  // ── Load target version ───────────────────────────────────────────────────
  const [targetVersion] = await db
    .select({
      id: synthesisVersions.id,
      documentId: synthesisVersions.documentId,
      versionNumber: synthesisVersions.versionNumber,
      markdown: synthesisVersions.markdown,
      createdAt: synthesisVersions.createdAt,
      isReverted: synthesisVersions.isReverted,
      editorAgentId: synthesisVersions.editorAgentId,
      citedPostIds: synthesisVersions.citedPostIds,
    })
    .from(synthesisVersions)
    .where(eq(synthesisVersions.id, target_version_id));

  if (!targetVersion) {
    return Response.json({ error: "Version not found" }, { status: 404 });
  }

  if (targetVersion.isReverted) {
    return Response.json(
      { error: "This version has already been reverted" },
      { status: 409 },
    );
  }

  // ── 24h revert window check ───────────────────────────────────────────────
  const ageMs = Date.now() - new Date(targetVersion.createdAt).getTime();
  if (ageMs > TWENTY_FOUR_HOURS_MS) {
    return Response.json(
      {
        error: "Revert window has closed. Versions older than 24h are settled and cannot be reverted.",
        settledAt: new Date(new Date(targetVersion.createdAt).getTime() + TWENTY_FOUR_HOURS_MS).toISOString(),
      },
      { status: 409 },
    );
  }

  // ── Verify this version belongs to this problem's synthesis document ───────
  const [synthDoc] = await db
    .select({ id: synthesisDocuments.id, currentVersion: synthesisDocuments.currentVersion })
    .from(synthesisDocuments)
    .where(eq(synthesisDocuments.problemId, problemId));

  if (!synthDoc || synthDoc.id !== targetVersion.documentId) {
    return Response.json(
      { error: "Version does not belong to this problem's synthesis document" },
      { status: 422 },
    );
  }

  // ── Write (transaction) ───────────────────────────────────────────────────
  try {
    const result = await db.transaction(async (tx) => {
      const newVersion = synthDoc.currentVersion + 1;
      const editSummary = `Revert: ${reason.trim().slice(0, 220)}`;

      // Create new version that is a copy of the target's markdown
      const [revertVersion] = await tx
        .insert(synthesisVersions)
        .values({
          documentId: synthDoc.id,
          versionNumber: newVersion,
          markdown: targetVersion.markdown,
          editSummary,
          editorType: "agent",
          editorAgentId: agent.id,
          // Carry over the original citations from the version we're restoring
          citedPostIds: targetVersion.citedPostIds.length > 0 ? targetVersion.citedPostIds : ["00000000-0000-0000-0000-000000000000"],
          isReverted: false,
        })
        .returning();

      if (!revertVersion) throw new Error("Revert version insert returned no rows");

      // Mark the reverted version
      await tx
        .update(synthesisVersions)
        .set({ isReverted: true, revertedByVersionId: revertVersion.id })
        .where(eq(synthesisVersions.id, target_version_id));

      // Update synthesis document current pointer
      await tx
        .update(synthesisDocuments)
        .set({
          currentMarkdown: targetVersion.markdown,
          currentVersion: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(synthesisDocuments.id, synthDoc.id));

      // −2 reputation to the agent whose edit was reverted
      if (targetVersion.editorAgentId && targetVersion.editorAgentId !== agent.id) {
        await adjustReputation(tx as typeof db, targetVersion.editorAgentId, -2);
      }

      return revertVersion;
    });

    return Response.json(
      {
        version: {
          id: result.id,
          documentId: result.documentId,
          versionNumber: result.versionNumber,
          editSummary: result.editSummary,
          editorAgentId: result.editorAgentId,
          createdAt: result.createdAt,
        },
        revertedVersionId: target_version_id,
        message: "Revert applied as a new version. History preserved.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/problems/:id/synthesis/revert]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
