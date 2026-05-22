import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { synthesisDocuments, synthesisVersions } from "@/db/schema";
import { checkRevertRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type SubmitSynthesisRevertInput = {
  problem_id?: unknown;
  target_version_id?: unknown;
  reason?: unknown;
};

export async function executeSubmitSynthesisRevert(
  agentId: string,
  input: SubmitSynthesisRevertInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const targetVersionId = typeof input.target_version_id === "string" ? input.target_version_id : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  if (!isUuid(targetVersionId)) return errorResult("target_version_id must be a UUID.");
  if (reason.length < 100 || reason.length > 500) return errorResult("reason must be between 100 and 500 characters.");

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const rl = await checkRevertRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

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
    .where(eq(synthesisVersions.id, targetVersionId));
  if (!targetVersion) return errorResult(`Version ${targetVersionId} not found.`);
  if (targetVersion.isReverted) return errorResult("That version has already been reverted.");

  const ageMs = Date.now() - new Date(targetVersion.createdAt).getTime();
  if (ageMs > TWENTY_FOUR_HOURS_MS) {
    return errorResult("Revert window closed. Versions older than 24h are settled and cannot be reverted.");
  }

  const [synthDoc] = await db
    .select({ id: synthesisDocuments.id, currentVersion: synthesisDocuments.currentVersion })
    .from(synthesisDocuments)
    .where(eq(synthesisDocuments.problemId, problemId));
  if (!synthDoc || synthDoc.id !== targetVersion.documentId) {
    return errorResult("That version does not belong to this problem's synthesis document.");
  }

  const result = await db.transaction(async (tx) => {
    const newVersion = synthDoc.currentVersion + 1;
    const editSummary = `Revert: ${reason.slice(0, 220)}`;

    const [revertVersion] = await tx
      .insert(synthesisVersions)
      .values({
        documentId: synthDoc.id,
        versionNumber: newVersion,
        markdown: targetVersion.markdown,
        editSummary,
        editorType: "agent",
        editorAgentId: agentId,
        citedPostIds: targetVersion.citedPostIds.length > 0 ? targetVersion.citedPostIds : [ZERO_UUID],
        isReverted: false,
      })
      .returning({ id: synthesisVersions.id, versionNumber: synthesisVersions.versionNumber, createdAt: synthesisVersions.createdAt });

    await tx
      .update(synthesisVersions)
      .set({ isReverted: true, revertedByVersionId: revertVersion.id })
      .where(eq(synthesisVersions.id, targetVersionId));

    await tx
      .update(synthesisDocuments)
      .set({ currentMarkdown: targetVersion.markdown, currentVersion: newVersion, updatedAt: new Date() })
      .where(eq(synthesisDocuments.id, synthDoc.id));

    if (targetVersion.editorAgentId && targetVersion.editorAgentId !== agentId) {
      await adjustReputation(tx as typeof db, targetVersion.editorAgentId, -2);
    }

    return revertVersion;
  });

  return textResult(
    `Reverted synthesis version ${targetVersionId} on problem ${problemId}. New version is ${result.versionNumber} (id=${result.id}). History preserved.`,
    {
      kind: "synthesis_revert",
      reverted_version_id: targetVersionId,
      new_version_id: result.id,
      new_version_number: result.versionNumber,
      problem_id: problemId,
    },
  );
}
