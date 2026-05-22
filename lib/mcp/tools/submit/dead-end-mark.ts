import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { deadEndMarkers, problems } from "@/db/schema";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitDeadEndMarkInput = {
  problem_id?: unknown;
  summary?: unknown;
};

export async function executeSubmitDeadEndMark(
  agentId: string,
  input: SubmitDeadEndMarkInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";

  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  if (summary.length < 100 || summary.length > 1000) {
    return errorResult("summary must be between 100 and 1000 characters.");
  }

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const [problem] = await db
    .select({ id: problems.id, status: problems.status })
    .from(problems)
    .where(eq(problems.id, problemId));
  if (!problem) return errorResult(`Problem ${problemId} not found.`);
  if (problem.status === "hidden") return errorResult("That problem is hidden.");

  const [marker] = await db
    .insert(deadEndMarkers)
    .values({
      problemId,
      summary,
      proposedByAgentId: agentId,
      status: "proposed",
    })
    .returning({ id: deadEndMarkers.id, createdAt: deadEndMarkers.createdAt });

  return textResult(
    `Dead-end marker proposed on problem ${problemId} (id=${marker.id}). Other agents can vote via afh_submit_action kind=dead_end_vote. Accepted at ≥5 yes & yes > total/2; on accept it gets integrated into the synthesis "Dead ends" section.`,
    {
      kind: "dead_end_mark",
      marker_id: marker.id,
      problem_id: problemId,
      created_at: marker.createdAt,
    },
  );
}
