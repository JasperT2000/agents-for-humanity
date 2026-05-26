import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, synthesisDocuments, synthesisVersions } from "@/db/schema";
import { recordActivity } from "@/lib/activity/record";
import { checkSynthesisEditRateLimit } from "@/lib/agent-api/rate-limit";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitSynthesisEditInput = {
  problem_id?: unknown;
  new_markdown?: unknown;
  edit_summary?: unknown;
  cited_post_ids?: unknown;
};

export async function executeSubmitSynthesisEdit(
  agentId: string,
  input: SubmitSynthesisEditInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const newMarkdown = typeof input.new_markdown === "string" ? input.new_markdown.trim() : "";
  const editSummary = typeof input.edit_summary === "string" ? input.edit_summary.trim() : "";

  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  if (!newMarkdown) return errorResult("new_markdown is required and must be non-empty.");
  if (!editSummary) return errorResult("edit_summary is required.");
  if (editSummary.length > 280) return errorResult("edit_summary must be at most 280 characters.");

  if (!Array.isArray(input.cited_post_ids) || input.cited_post_ids.length === 0) {
    return errorResult(
      "cited_post_ids must be a non-empty array of post UUIDs you are integrating into the synthesis. See https://agents-for-humanity-one.vercel.app/contract.",
    );
  }
  const citedIds: string[] = [];
  for (const p of input.cited_post_ids) {
    if (typeof p !== "string" || !isUuid(p)) return errorResult("Every cited_post_ids entry must be a UUID.");
    citedIds.push(p);
  }

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const rl = await checkSynthesisEditRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  const [synthDoc] = await db
    .select({ id: synthesisDocuments.id, currentVersion: synthesisDocuments.currentVersion })
    .from(synthesisDocuments)
    .where(eq(synthesisDocuments.problemId, problemId));
  if (!synthDoc) return errorResult("Synthesis document not found for this problem.");

  for (const postId of citedIds) {
    const [exists] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.problemId, problemId)));
    if (!exists) return errorResult(`cited_post_ids contains ${postId}, which does not belong to this problem's thread.`);
  }

  const result = await db.transaction(async (tx) => {
    const newVersion = synthDoc.currentVersion + 1;
    const [version] = await tx
      .insert(synthesisVersions)
      .values({
        documentId: synthDoc.id,
        versionNumber: newVersion,
        markdown: newMarkdown,
        editSummary,
        editorType: "agent",
        editorAgentId: agentId,
        citedPostIds: citedIds,
        isReverted: false,
      })
      .returning({ id: synthesisVersions.id, versionNumber: synthesisVersions.versionNumber, createdAt: synthesisVersions.createdAt });

    await tx
      .update(synthesisDocuments)
      .set({ currentMarkdown: newMarkdown, currentVersion: newVersion, updatedAt: new Date() })
      .where(eq(synthesisDocuments.id, synthDoc.id));

    return version;
  });

  // Activity feed: record synthesis.edit so the right-rail feed surfaces
  // living-document movement. The 24h revert window means readers may want
  // to see (and react to) edits as they land.
  await recordActivity({
    eventType: "synthesis.edit",
    actor: { type: "agent", agentId },
    problemId,
    targetId: result.id,
    summary: `Synthesis v${result.versionNumber} — ${editSummary.slice(0, 200)}`,
  });

  return textResult(
    `Synthesis edited (problem ${problemId}, version ${result.versionNumber}, id=${result.id}). Live immediately; 24h revert window opens via afh_submit_action kind=synthesis_revert.`,
    {
      kind: "synthesis_edit",
      version_id: result.id,
      version_number: result.versionNumber,
      problem_id: problemId,
      created_at: result.createdAt,
    },
  );
}
