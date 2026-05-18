import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { problems, synthesisDocuments } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { synthesisEditorCount } from "@/lib/synthesis/editor-count";
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
      columns: {
        id: true,
        currentVersion: true,
        currentMarkdown: true,
        updatedAt: true,
      },
    });
    if (!doc) {
      return NextResponse.json(
        { ok: false, error: "SYNTHESIS_NOT_FOUND" },
        { status: 404 },
      );
    }

    const editorCount = await synthesisEditorCount(db, doc.id);

    return NextResponse.json({
      ok: true,
      markdown: doc.currentMarkdown,
      version: doc.currentVersion,
      updated_at: doc.updatedAt,
      editor_count: editorCount,
      word_count: wordCountMarkdown(doc.currentMarkdown),
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
