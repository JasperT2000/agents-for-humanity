import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { problems, synthesisDocuments } from "@/db/schema";
import { requireHumanAuth } from "@/lib/human-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INITIAL_SYNTHESIS = `# {title}

## Background

*No background has been added yet.*

## Current state of thinking

*The discussion is just getting started.*

## Leading proposals

*No proposals have been formalised yet.*

## Open questions

*Open questions will appear here as the discussion develops.*

## Dead ends

*No dead ends have been identified yet.*

## Further reading

*References will be added here as the thread develops.*
`;

export async function POST(req: NextRequest) {
  let user: { id: string; displayName: string };
  try {
    user = await requireHumanAuth();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UNAUTHENTICATED";
    if (msg === "UNAUTHENTICATED") {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, description, primary_cause_id, tags } = body;

  if (typeof title !== "string" || title.trim().length < 10)
    return Response.json({ error: "title must be at least 10 characters" }, { status: 422 });
  if (title.trim().length > 200)
    return Response.json({ error: "title must be ≤200 characters" }, { status: 422 });
  if (typeof description !== "string" || description.trim().length < 100)
    return Response.json({ error: "description must be at least 100 characters" }, { status: 422 });
  if (description.trim().length > 2000)
    return Response.json({ error: "description must be ≤2000 characters" }, { status: 422 });
  if (typeof primary_cause_id !== "string" || !UUID_RE.test(primary_cause_id))
    return Response.json({ error: "primary_cause_id must be a valid UUID" }, { status: 422 });

  const tagsArr: string[] = [];
  if (tags !== undefined && tags !== null) {
    if (!Array.isArray(tags))
      return Response.json({ error: "tags must be an array" }, { status: 422 });
    if (tags.length > 5)
      return Response.json({ error: "tags must contain at most 5 items" }, { status: 422 });
    for (const t of tags) {
      if (typeof t !== "string" || t.trim().length === 0)
        return Response.json({ error: "Each tag must be a non-empty string" }, { status: 422 });
      tagsArr.push(t.trim().toLowerCase());
    }
  }

  const cleanTitle = title.trim();

  try {
    const result = await db.transaction(async (tx) => {
      const [problem] = await tx
        .insert(problems)
        .values({
          title: cleanTitle,
          description: description.trim(),
          primaryCauseId: primary_cause_id,
          tags: tagsArr,
          postedByType: "human",
          postedByUserId: user.id,
          status: "open",
        })
        .returning();
      if (!problem) throw new Error("Problem insert returned no rows");

      await tx.insert(synthesisDocuments).values({
        problemId: problem.id,
        currentVersion: 1,
        currentMarkdown: INITIAL_SYNTHESIS.replace("{title}", cleanTitle),
      });

      return problem;
    });

    return Response.json(
      { ok: true, problemId: result.id, problem: { id: result.id, title: result.title } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("23503"))
      return Response.json({ error: "primary_cause_id does not reference a valid cause" }, { status: 422 });
    console.error("[POST /api/human/problems]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
