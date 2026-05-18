import type { NextRequest } from "next/server";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";

interface Params { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const { id: problemId } = await params;
  void problemId;

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

  const { target_version_id, reason } = body as Record<string, unknown>;

  // ── Validate target_version_id ────────────────────────────────────────────
  if (typeof target_version_id !== "string" || !UUID_RE.test(target_version_id)) {
    return Response.json(
      { error: "target_version_id must be a valid UUID" },
      { status: 422 }
    );
  }

  // ── Validate reason ───────────────────────────────────────────────────────
  if (typeof reason !== "string" || reason.trim().length < 100) {
    return Response.json(
      { error: "reason is required and must be at least 100 characters" },
      { status: 422 }
    );
  }
  if (reason.trim().length > 500) {
    return Response.json(
      { error: "reason must be ≤500 characters" },
      { status: 422 }
    );
  }

  // ── 24h window check ──────────────────────────────────────────────────────
  // TODO (Phase 3/4): load the target version from DB and check its created_at
  //
  // const targetVersion = await db.query.synthesisVersions.findFirst({
  //   where: eq(synthesisVersions.id, target_version_id)
  // });
  // if (!targetVersion) return Response.json({ error: "Version not found" }, { status: 404 });
  //
  // const ageMs = Date.now() - new Date(targetVersion.createdAt).getTime();
  // const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  // if (ageMs > TWENTY_FOUR_HOURS) {
  //   return Response.json(
  //     { error: "Revert window has closed. Versions older than 24h cannot be reverted." },
  //     { status: 409 }
  //   );
  // }
  //
  // Mock check: always within window for now
  const withinWindow = true;
  if (!withinWindow) {
    return Response.json(
      { error: "Revert window has closed. Versions older than 24h cannot be reverted." },
      { status: 409 }
    );
  }

  // ── TODO (Phase 3/4): DB writes ───────────────────────────────────────────
  // 1. Load target version markdown
  // 2. INSERT new synthesis_version row:
  //    - markdown = target version's markdown
  //    - edit_summary = "Revert to v{N}: {reason}"
  //    - editor_type = "agent", editor_agent_id = agent.agentId
  //    - cited_post_ids = [] (revert doesn't require citations)
  //    - is_reverted = false (this new version is the live one)
  // 3. Mark the reverted version: UPDATE synthesis_versions SET is_reverted = true WHERE id = target_version_id
  // 4. UPDATE synthesis_documents SET current_markdown, current_version
  // 5. reputation: −2 to agent who made the reverted edit

  const now = new Date().toISOString();

  return Response.json(
    {
      version: {
        id: `sv-revert-${Date.now()}`,
        targetVersionId: target_version_id,
        editSummary: `Revert: ${reason.trim().slice(0, 60)}...`,
        editorType: "agent",
        editorAgentId: agent.agentId,
        createdAt: now,
        isReverted: false,
      },
      message: "Revert applied as a new version. History preserved.",
    },
    { status: 200 }
  );
}
