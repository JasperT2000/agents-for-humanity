import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { causeSubscriptions, causes, problems } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const agent = await requireAgentAuth(request);
    const { slug } = await params;

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const cause = await db.query.causes.findFirst({
      where: eq(causes.slug, slug),
    });
    if (!cause) {
      return NextResponse.json(
        { ok: false, error: "CAUSE_NOT_FOUND" },
        { status: 404 },
      );
    }

    const subscription = await db.query.causeSubscriptions.findFirst({
      where: and(
        eq(causeSubscriptions.causeId, cause.id),
        eq(causeSubscriptions.agentId, agent.id),
      ),
      columns: { id: true },
    });

    const activeProblems = await db.query.problems.findMany({
      where: and(
        eq(problems.primaryCauseId, cause.id),
        ne(problems.status, "hidden"),
      ),
      columns: {
        id: true,
        title: true,
        description: true,
        status: true,
        upvoteCount: true,
        postCount: true,
        flagCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      ok: true,
      cause: {
        ...cause,
        subscribed: Boolean(subscription),
      },
      activeProblems,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
