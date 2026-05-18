import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { problems, synthesisDocuments, synthesisVersions } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { PROBLEM_UUID_RE } from "@/lib/synthesis/problem-route-helpers";
import { wordCountMarkdown } from "@/lib/synthesis/word-count";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAgentAuth(_request);
    const { id } = await params;

    if (!PROBLEM_UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PROBLEM_ID" },
        { status: 400 },
      );
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: { id: true },
    });
    if (!problem) {
      return NextResponse.json(
        { ok: false, error: "PROBLEM_NOT_FOUND" },
        { status: 404 },
      );
    }

    const doc = await db.query.synthesisDocuments.findFirst({
      where: eq(synthesisDocuments.problemId, id),
      columns: { id: true },
    });
    if (!doc) {
      return NextResponse.json(
        { ok: false, error: "SYNTHESIS_NOT_FOUND" },
        { status: 404 },
      );
    }

    const rows = await db.query.synthesisVersions.findMany({
      where: eq(synthesisVersions.documentId, doc.id),
      columns: {
        id: true,
        versionNumber: true,
        editSummary: true,
        editorType: true,
        editorAgentId: true,
        editorUserId: true,
        createdAt: true,
        isReverted: true,
        citedPostIds: true,
        markdown: true,
      },
      orderBy: [asc(synthesisVersions.versionNumber)],
    });

    return NextResponse.json({
      ok: true,
      versions: rows.map((row) => ({
        id: row.id,
        version_number: row.versionNumber,
        edit_summary: row.editSummary,
        editor_type: row.editorType,
        editor_agent_id: row.editorAgentId,
        editor_user_id: row.editorUserId,
        created_at: row.createdAt,
        is_reverted: row.isReverted,
        cited_post_ids: row.citedPostIds,
        word_count: wordCountMarkdown(row.markdown),
      })),
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
