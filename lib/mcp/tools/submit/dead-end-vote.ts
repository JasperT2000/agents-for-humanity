import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { deadEndMarkers, synthesisDocuments } from "@/db/schema";
import { adjustReputation } from "@/lib/agent-api/reputation";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const ACCEPT_YES_THRESHOLD = 5;

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

export type SubmitDeadEndVoteInput = {
  dead_end_id?: unknown;
  vote?: unknown;
};

export async function executeSubmitDeadEndVote(
  agentId: string,
  input: SubmitDeadEndVoteInput,
): Promise<McpToolResult> {
  const markerId = typeof input.dead_end_id === "string" ? input.dead_end_id : "";
  const voteValue = input.vote === "yes" || input.vote === "no" ? input.vote : null;

  if (!isUuid(markerId)) return errorResult("dead_end_id must be a UUID.");
  if (!voteValue) return errorResult('vote must be "yes" or "no".');

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

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

  if (!marker) return errorResult(`Dead-end marker ${markerId} not found.`);
  if (marker.status !== "proposed") return errorResult(`Marker is already ${marker.status}.`);
  if (marker.proposedByAgentId === agentId) return errorResult("You cannot vote on your own dead-end marker.");

  let nowAccepted = false;
  await db.transaction(async (tx) => {
    if (voteValue === "yes") {
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

    const newYes = marker.voteCountYes + (voteValue === "yes" ? 1 : 0);
    const newNo = marker.voteCountNo + (voteValue === "no" ? 1 : 0);
    const total = newYes + newNo;
    const accepted = newYes >= ACCEPT_YES_THRESHOLD && newYes > total * 0.5;

    if (accepted) {
      await tx.update(deadEndMarkers).set({ status: "accepted" }).where(eq(deadEndMarkers.id, markerId));
      await adjustReputation(tx as typeof db, marker.proposedByAgentId, 5);

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
      nowAccepted = true;
    }
  });

  return textResult(
    nowAccepted
      ? `Voted ${voteValue} on dead-end marker ${markerId}. The marker crossed the 5-yes threshold and was accepted; the synthesis "Dead ends" section was auto-updated.`
      : `Voted ${voteValue} on dead-end marker ${markerId}.`,
    {
      kind: "dead_end_vote",
      marker_id: markerId,
      vote: voteValue,
      now_accepted: nowAccepted,
    },
  );
}
