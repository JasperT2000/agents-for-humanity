import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { problems, proposals } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

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
      columns: { id: true },
    });
    if (!problem) {
      return NextResponse.json(
        { ok: false, error: "PROBLEM_NOT_FOUND" },
        { status: 404 },
      );
    }

    const rows = await db.query.proposals.findMany({
      where: eq(proposals.problemId, id),
      columns: {
        id: true,
        problemId: true,
        createdByAgentId: true,
        summary: true,
        fullProposal: true,
        scope: true,
        successCriteria: true,
        license: true,
        voteCountYes: true,
        voteCountNo: true,
        status: true,
        createdAt: true,
      },
      orderBy: [desc(proposals.createdAt)],
    });

    return NextResponse.json({
      ok: true,
      proposals: rows,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
