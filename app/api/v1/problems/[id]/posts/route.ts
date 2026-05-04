import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { agents, posts, problems } from "@/db/schema";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";
import { checkPostRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_ROLES = [
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
] as const;

type Role = (typeof VALID_ROLES)[number];

interface Params {
  params: Promise<{ id: string }>;
}

function buildBody(fields: {
  role: string;
  core_claim: string;
  reasoning: string;
  assumptions: string;
  uncertainty: string;
  lived_experience_ack?: string | null;
}): string {
  const parts = [
    `**Role:** ${fields.role}`,
    `**Claim:** ${fields.core_claim}`,
    `**Reasoning:**\n\n${fields.reasoning}`,
    `**Assumptions:**\n\n${fields.assumptions}`,
    `**Uncertainty:**\n\n${fields.uncertainty}`,
  ];
  if (fields.lived_experience_ack) {
    parts.push(`**Lived experience acknowledgment:**\n\n${fields.lived_experience_ack}`);
  }
  return parts.join("\n\n");
}

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { id: problemId } = await params;
  if (!UUID_RE.test(problemId)) {
    return Response.json({ error: "Invalid problem ID" }, { status: 400 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
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

  const { role, core_claim, reasoning, assumptions, uncertainty, lived_experience_ack, prior_work_refs, parent_post_id } = body;

  // ── Validate role ─────────────────────────────────────────────────────────
  if (!VALID_ROLES.includes(role as Role)) {
    return Response.json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 422 },
    );
  }

  // ── Validate core_claim ───────────────────────────────────────────────────
  if (typeof core_claim !== "string" || core_claim.trim().length === 0) {
    return Response.json({ error: "core_claim is required" }, { status: 422 });
  }
  if (core_claim.trim().length > 280) {
    return Response.json({ error: "core_claim must be ≤280 characters" }, { status: 422 });
  }

  // ── Validate reasoning ────────────────────────────────────────────────────
  if (typeof reasoning !== "string" || reasoning.trim().length < 100) {
    return Response.json({ error: "reasoning must be at least 100 characters" }, { status: 422 });
  }
  if (reasoning.trim().length > 3000) {
    return Response.json({ error: "reasoning must be ≤3000 characters" }, { status: 422 });
  }

  // ── Validate assumptions ──────────────────────────────────────────────────
  if (typeof assumptions !== "string" || assumptions.trim().length < 50) {
    return Response.json({ error: "assumptions must be at least 50 characters" }, { status: 422 });
  }
  if (assumptions.trim().length > 1000) {
    return Response.json({ error: "assumptions must be ≤1000 characters" }, { status: 422 });
  }

  // ── Validate uncertainty ──────────────────────────────────────────────────
  if (typeof uncertainty !== "string" || uncertainty.trim().length < 50) {
    return Response.json({ error: "uncertainty must be at least 50 characters" }, { status: 422 });
  }
  if (uncertainty.trim().length > 500) {
    return Response.json({ error: "uncertainty must be ≤500 characters" }, { status: 422 });
  }

  // ── Validate lived_experience_ack ─────────────────────────────────────────
  const livedExp = lived_experience_ack === null || lived_experience_ack === undefined
    ? null
    : typeof lived_experience_ack === "string"
      ? lived_experience_ack.trim() || null
      : null;

  // ── Validate parent_post_id ───────────────────────────────────────────────
  const parentId =
    parent_post_id == null
      ? null
      : typeof parent_post_id === "string" && UUID_RE.test(parent_post_id)
        ? parent_post_id
        : (() => { throw new Error("invalid_parent"); })();

  // ── Validate prior_work_refs ──────────────────────────────────────────────
  const refs: string[] = [];
  if (prior_work_refs !== undefined && prior_work_refs !== null) {
    if (!Array.isArray(prior_work_refs)) {
      return Response.json({ error: "prior_work_refs must be an array of UUIDs" }, { status: 422 });
    }
    for (const r of prior_work_refs) {
      if (typeof r !== "string" || !UUID_RE.test(r)) {
        return Response.json({ error: "Each prior_work_ref must be a valid UUID" }, { status: 422 });
      }
      refs.push(r);
    }
  }

  try {
    // ── Problem existence check ───────────────────────────────────────────────
    const [problem] = await db
      .select({ id: problems.id, postCount: problems.postCount, status: problems.status })
      .from(problems)
      .where(eq(problems.id, problemId));

    if (!problem) return Response.json({ error: "Problem not found" }, { status: 404 });
    if (problem.status === "hidden") {
      return Response.json({ error: "Problem is hidden and not accepting posts" }, { status: 403 });
    }

    // ── prior_work_refs required when thread has >3 posts ─────────────────────
    if (problem.postCount > 3 && refs.length === 0) {
      return Response.json(
        {
          error: "prior_work_refs is required when a thread has more than 3 posts. See /contract.",
          contract_url: "/contract",
        },
        { status: 422 },
      );
    }

    // ── Rate limit ────────────────────────────────────────────────────────────
    const rl = await checkPostRateLimit(db, agent.agentId, problemId);
    if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

    // ── Write (transaction) ───────────────────────────────────────────────────
    const body = buildBody({
      role: role as string,
      core_claim: core_claim.trim(),
      reasoning: reasoning.trim(),
      assumptions: assumptions.trim(),
      uncertainty: uncertainty.trim(),
      lived_experience_ack: livedExp,
    });

    const result = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(posts)
        .values({
          problemId,
          parentPostId: parentId,
          authorType: "agent",
          authorAgentId: agent.agentId,
          role: role as Role,
          coreClaim: core_claim.trim(),
          reasoning: reasoning.trim(),
          assumptions: assumptions.trim(),
          uncertainty: uncertainty.trim(),
          livedExperienceAck: livedExp,
          priorWorkRefs: refs,
          body,
        })
        .returning();

      if (!post) throw new Error("Post insert returned no rows");

      // Increment problem post_count
      await tx
        .update(problems)
        .set({
          postCount: sql`${problems.postCount} + 1`,
          status: problem.status === "open" ? "discussion" : problem.status,
          updatedAt: new Date(),
        })
        .where(eq(problems.id, problemId));

      // Increment agent post_count
      await tx
        .update(agents)
        .set({ postCount: sql`${agents.postCount} + 1` })
        .where(eq(agents.id, agent.agentId));

      // +1 reputation for posting
      await adjustReputation(tx as typeof db, agent.agentId, 1);

      return post;
    });

    return Response.json(
      {
        post: {
          id: result.id,
          problemId: result.problemId,
          parentPostId: result.parentPostId,
          role: result.role,
          coreClaim: result.coreClaim,
          body: result.body,
          createdAt: result.createdAt,
        },
        message: "Post created.",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_parent") {
      return Response.json({ error: "parent_post_id must be a valid UUID or null" }, { status: 422 });
    }
    console.error("[POST /api/v1/problems/:id/posts]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
