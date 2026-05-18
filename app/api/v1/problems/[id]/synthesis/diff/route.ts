import { and, eq } from "drizzle-orm";
import { createPatch } from "diff";
import { NextResponse } from "next/server";

import type { Db } from "@/db";
import { getDb } from "@/db";
import { problems, synthesisDocuments, synthesisVersions } from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { PROBLEM_UUID_RE } from "@/lib/synthesis/problem-route-helpers";

type Params = { params: Promise<{ id: string }> };

type SynthesisDocRow = {
  id: string;
  currentVersion: number;
  currentMarkdown: string;
};

async function markdownForProblemVersion(
  database: Db,
  row: SynthesisDocRow,
  versionNumber: number,
): Promise<string | null> {
  if (versionNumber === row.currentVersion) {
    return row.currentMarkdown;
  }
  const record = await database.query.synthesisVersions.findFirst({
    where: and(
      eq(synthesisVersions.documentId, row.id),
      eq(synthesisVersions.versionNumber, versionNumber),
    ),
    columns: { markdown: true },
  });
  return record?.markdown ?? null;
}

function parseVersionParam(value: string | null, name: string) {
  if (value === null || value === "") return { error: `MISSING_${name}` as const };
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return { error: `INVALID_${name}` as const };
  return { value: n } as const;
}

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
    const fromParsed = parseVersionParam(url.searchParams.get("from"), "FROM");
    const toParsed = parseVersionParam(url.searchParams.get("to"), "TO");
    if ("error" in fromParsed) {
      return NextResponse.json(
        { ok: false, error: fromParsed.error },
        { status: 400 },
      );
    }
    if ("error" in toParsed) {
      return NextResponse.json(
        { ok: false, error: toParsed.error },
        { status: 400 },
      );
    }
    if (fromParsed.value === toParsed.value) {
      return NextResponse.json(
        { ok: false, error: "FROM_AND_TO_MUST_DIFFER" },
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

    const synthesisRow = await db.query.synthesisDocuments.findFirst({
      where: eq(synthesisDocuments.problemId, id),
      columns: { id: true, currentVersion: true, currentMarkdown: true },
    });
    if (!synthesisRow) {
      return NextResponse.json(
        { ok: false, error: "SYNTHESIS_NOT_FOUND" },
        { status: 404 },
      );
    }

    const docSnap: SynthesisDocRow = {
      id: synthesisRow.id,
      currentVersion: synthesisRow.currentVersion,
      currentMarkdown: synthesisRow.currentMarkdown,
    };

    const fromMd = await markdownForProblemVersion(db, docSnap, fromParsed.value);
    const toMd = await markdownForProblemVersion(db, docSnap, toParsed.value);
    if (fromMd === null) {
      return NextResponse.json(
        { ok: false, error: "VERSION_FROM_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (toMd === null) {
      return NextResponse.json(
        { ok: false, error: "VERSION_TO_NOT_FOUND" },
        { status: 404 },
      );
    }

    const headerFrom = `synthesis-v${fromParsed.value}`;
    const headerTo = `synthesis-v${toParsed.value}`;
    const patch = createPatch(
      `problem-${id}-synthesis`,
      fromMd,
      toMd,
      headerFrom,
      headerTo,
    );

    return new NextResponse(patch, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
