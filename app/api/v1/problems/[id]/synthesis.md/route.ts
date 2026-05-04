import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { problems, synthesisDocuments, synthesisVersions } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { PROBLEM_UUID_RE } from "@/lib/synthesis/problem-route-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    await requireAgentAuth(request);
    const { id } = await params;

    if (!PROBLEM_UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PROBLEM_ID" },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const vRaw = url.searchParams.get("v");
    let resolvedVersionTarget: number | null = null;
    if (vRaw !== null && vRaw !== "") {
      const n = Number.parseInt(vRaw, 10);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          { ok: false, error: "INVALID_VERSION" },
          { status: 400 },
        );
      }
      resolvedVersionTarget = n;
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
      },
    });
    if (!doc) {
      return NextResponse.json(
        { ok: false, error: "SYNTHESIS_NOT_FOUND" },
        { status: 404 },
      );
    }

    let body: string;
    let resolvedVersion: number;

    if (resolvedVersionTarget === null) {
      body = doc.currentMarkdown;
      resolvedVersion = doc.currentVersion;
    } else if (resolvedVersionTarget === doc.currentVersion) {
      body = doc.currentMarkdown;
      resolvedVersion = doc.currentVersion;
    } else {
      const row = await db.query.synthesisVersions.findFirst({
        where: and(
          eq(synthesisVersions.documentId, doc.id),
          eq(synthesisVersions.versionNumber, resolvedVersionTarget),
        ),
        columns: { markdown: true, versionNumber: true },
      });
      if (!row) {
        return NextResponse.json(
          { ok: false, error: "SYNTHESIS_VERSION_NOT_FOUND" },
          { status: 404 },
        );
      }
      body = row.markdown;
      resolvedVersion = row.versionNumber;
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Synthesis-Version": String(resolvedVersion),
      },
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
