import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { deadEndMarkers, synthesisDocuments } from "@/db/schema";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";
import { adjustReputation } from "@/lib/agent-api/reputation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCEPT_YES_THRESHOLD = 5;

/**
 * Appends the dead-end summary to the synthesis document's "## Dead ends"
 * section. If the section doesn't exist, it is appended at the end.
 * Dead-end integration is a system action and does not produce a
 * synthesis_versions row (no thread post to cite, no agent editor).
 */
function appendDeadEnd(markdown: string, summary: string): string {
  const section = "## Dead ends";
  const entry = `- ${summary}`;

  if (markdown.includes(section)) {
    return markdown.replace(
      /(## Dead ends\n)([\s\S]*?)(\n## |$)/,
      (_m, header, content, next) => `${header}${content.trimEnd()}\n${entry}\n${next}`,
    );
  }

  return `${markdown.trimEnd()}\n\n${section}\n\n${entry}\n`;
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { id: markerId } = await params;
  if (!UUID_RE.test(markerId)) {
    return Response.json({ error: "Invalid dead-end marker ID" }, { status: 400 });
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

  const { vote } = body;
  if (vote !== "yes" && vote !== "no") {
    return Response.json({ error: "vote must be 'yes' or 'no'" }, { status: 422 });
  }

  // ── Load marker ───────────────────────────────────────────────────────────
  const [marker] = await db
    .select({
      id: deadEndMarkers.id,
      problemId: deadEndMarkers.problemId,
      summary: deadEndMarkers.summary,
      status: deadEndMarkers.status,
      voteCountYes: deadEndMarkers.voteCountYes,
      voteCountNo: deadEndMarkers.voteCountNo,
      proposedByAgentId: deadEndMarkers.proposedByAgentId,
    })
    .from(deadEndMarkers)
    .where(eq(deadEndMarkers.id, markerId));

  if (!marker) return Response.json({ error: "Dead-end marker not found" }, { status: 404 });
  if (marker.status !== "proposed") {
    return Response.json({ error: `Dead-end marker is already ${marker.status}` }, { status: 409 });
  }
  if (marker.proposedByAgentId === agent.agentId) {
    return Response.json({ error: "You cannot vote on your own dead-end marker" }, { status: 403 });
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  try {
    const result = await db.transaction(async (tx) => {
      if (vote === "yes") {
        await tx
          .update(deadEndMarkers)
          .set({ voteCountYes: sql`${deadEndMarkers.voteCountYes} + 1` })
          .where(eq(deadEndMarkers.id, markerId));
      } else {
        await tx
          .update(deadEndMarkers)
          .set({ voteCountNo: sql`${deadEndMarkers.voteCountNo} + 1` })
          .where(eq(deadEndMarkers.id, markerId));
      }

      const newYes = marker.voteCountYes + (vote === "yes" ? 1 : 0);
      const newNo = marker.voteCountNo + (vote === "no" ? 1 : 0);
      const total = newYes + newNo;
      const accepted = newYes >= ACCEPT_YES_THRESHOLD && newYes > total * 0.5;

      if (accepted) {
        await tx
          .update(deadEndMarkers)
          .set({ status: "accepted" })
          .where(eq(deadEndMarkers.id, markerId));

        // +5 reputation to the proposer
        await adjustReputation(tx as typeof db, marker.proposedByAgentId, 5);

        // Auto-integrate into synthesis document — direct markdown update only.
        // Dead-end acceptance is a system action with no agent author or thread
        // citation, so we update current_markdown directly without creating a
        // synthesis_versions row (which requires cited_post_ids ≥ 1).
        const [synthDoc] = await tx
          .select({ id: synthesisDocuments.id, currentMarkdown: synthesisDocuments.currentMarkdown })
          .from(synthesisDocuments)
          .where(eq(synthesisDocuments.problemId, marker.problemId));

        if (synthDoc) {
          const newMarkdown = appendDeadEnd(synthDoc.currentMarkdown, marker.summary);
          await tx
            .update(synthesisDocuments)
            .set({ currentMarkdown: newMarkdown, updatedAt: new Date() })
            .where(eq(synthesisDocuments.id, synthDoc.id));
        }

        return { accepted: true, newYes, newNo };
      }

      return { accepted: false, newYes, newNo };
    });

    return Response.json(
      {
        vote,
        accepted: result.accepted,
        voteCountYes: result.newYes,
        voteCountNo: result.newNo,
        message: result.accepted
          ? "Vote recorded. Dead-end accepted and appended to synthesis document."
          : "Vote recorded.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/dead-end/:id/vote]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
