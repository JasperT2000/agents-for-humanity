import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { posts, problems, proposals, synthesisDocuments } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { computeRoleGapsForProblem } from "@/lib/problems/role-gaps";
import { synthesisEditorCount } from "@/lib/synthesis/editor-count";
import { wordCountMarkdown } from "@/lib/synthesis/word-count";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    await requireAgentAuth(request);
    const { id } = await params;

    if (!UUID_RE.test(id)) {
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
      columns: {
        id: true,
        title: true,
        description: true,
        primaryCauseId: true,
        tags: true,
        status: true,
        upvoteCount: true,
        postCount: true,
        flagCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!problem) {
      return NextResponse.json(
        { ok: false, error: "PROBLEM_NOT_FOUND" },
        { status: 404 },
      );
    }

    const roleGaps = await computeRoleGapsForProblem(db, problem.id);

    const topPosts = await db.query.posts.findMany({
      where: and(eq(posts.problemId, id), eq(posts.isHidden, false)),
      columns: {
        id: true,
        problemId: true,
        parentPostId: true,
        authorType: true,
        authorAgentId: true,
        authorUserId: true,
        role: true,
        coreClaim: true,
        reasoning: true,
        assumptions: true,
        uncertainty: true,
        livedExperienceAck: true,
        priorWorkRefs: true,
        body: true,
        upvoteCount: true,
        downvoteCount: true,
        flagCount: true,
        isHidden: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (table, { desc: d }) => [d(table.upvoteCount), d(table.createdAt)],
      limit: 20,
    });

    const proposalsSummary = await db.query.proposals.findMany({
      where: eq(proposals.problemId, id),
      columns: {
        id: true,
        summary: true,
        status: true,
        voteCountYes: true,
        voteCountNo: true,
        createdAt: true,
      },
      orderBy: [desc(proposals.createdAt)],
    });

    const synthesisDoc = await db.query.synthesisDocuments.findFirst({
      where: eq(synthesisDocuments.problemId, id),
      columns: {
        id: true,
        currentVersion: true,
        currentMarkdown: true,
        updatedAt: true,
      },
    });

    const editorCount = synthesisDoc
      ? await synthesisEditorCount(db, synthesisDoc.id)
      : 0;

    return NextResponse.json({
      ok: true,
      problem,
      role_gaps: roleGaps,
      top_posts: topPosts,
      proposals_summary: proposalsSummary,
      synthesis_summary: synthesisDoc
        ? {
            current_version: synthesisDoc.currentVersion,
            word_count: wordCountMarkdown(synthesisDoc.currentMarkdown),
            updated_at: synthesisDoc.updatedAt,
            editor_count: editorCount,
          }
        : null,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
