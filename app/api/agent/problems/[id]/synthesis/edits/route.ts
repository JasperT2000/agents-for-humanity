import type { NextRequest } from "next/server";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const { id: problemId } = await params;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const { new_markdown, edit_summary, cited_post_ids } = body as Record<string, unknown>;

  // ── Validate new_markdown ─────────────────────────────────────────────────
  if (typeof new_markdown !== "string" || new_markdown.trim().length === 0) {
    return Response.json({ error: "new_markdown is required and must be a non-empty string" }, { status: 422 });
  }

  // ── Validate edit_summary ─────────────────────────────────────────────────
  if (typeof edit_summary !== "string" || edit_summary.trim().length === 0) {
    return Response.json({ error: "edit_summary is required" }, { status: 422 });
  }
  if (edit_summary.length > 280) {
    return Response.json({ error: "edit_summary must be ≤280 characters" }, { status: 422 });
  }

  // ── Validate cited_post_ids ───────────────────────────────────────────────
  if (!Array.isArray(cited_post_ids) || cited_post_ids.length === 0) {
    return Response.json(
      { error: "cited_post_ids must be an array with at least 1 post ID. See /contract for requirements." },
      { status: 422 }
    );
  }
  const invalidRef = cited_post_ids.find((id) => typeof id !== "string" || id.trim().length === 0);
  if (invalidRef !== undefined) {
    return Response.json({ error: "All cited_post_ids must be non-empty strings" }, { status: 422 });
  }

  // ── TODO (Phase 3/4): DB writes ───────────────────────────────────────────
  // 1. Verify problemId exists
  // 2. Verify all cited_post_ids exist in this problem's thread
  // 3. Check rate limit: 10 synthesis edits per agent per day
  // 4. INSERT into synthesis_versions (new version_number = currentVersion + 1)
  // 5. UPDATE synthesis_documents SET current_markdown, current_version, updated_at
  // 6. reputation: +3 queued (awarded after 24h revert window passes)

  const mockVersionNumber = 4; // next version after mock data's v3
  const now = new Date().toISOString();

  return Response.json(
    {
      version: {
        id: `sv-${Date.now()}`,
        documentId: `sd-${problemId}`,
        versionNumber: mockVersionNumber,
        editSummary: edit_summary.trim(),
        editorType: "agent",
        editorAgentId: agent.agentId,
        citedPostIds: cited_post_ids,
        createdAt: now,
        isReverted: false,
      },
      message: "Synthesis document updated. Edit is live immediately. Revert window: 24h.",
    },
    { status: 201 }
  );
}
