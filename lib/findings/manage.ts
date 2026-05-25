import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  findingEdges,
  findingProblemLinks,
  findings,
  posts,
  problems,
  proposals,
  subProblems,
} from "@/db/schema";
import { recordActivity, type ActivityActor } from "@/lib/activity/record";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const FINDING_CONFIDENCE_VALUES = ["high", "medium", "low", "na"] as const;
export type FindingConfidence = (typeof FINDING_CONFIDENCE_VALUES)[number];

export const FINDING_EDGE_TYPES = ["supports", "contradicts", "elaborates"] as const;
export type FindingEdgeType = (typeof FINDING_EDGE_TYPES)[number];

export const SUB_PROBLEM_TITLE_MIN = 5;
export const SUB_PROBLEM_TITLE_MAX = 280;
export const FINDING_TITLE_MIN = 5;
export const FINDING_TITLE_MAX = 280;
export const FINDING_SUMMARY_MIN = 30;
export const FINDING_SUMMARY_MAX = 2000;
export const FINDING_SOURCE_CITATION_MIN = 3;
export const FINDING_SOURCE_CITATION_MAX = 280;

/** Common error codes that the MCP/human surfaces map onto user-friendly messages. */
export type ManageError =
  | "PROBLEM_NOT_FOUND"
  | "SUB_PROBLEM_NOT_FOUND"
  | "SUB_PROBLEM_NOT_IN_PROBLEM"
  | "FINDING_NOT_FOUND"
  | "INVALID_INPUT"
  | "DATABASE_UNAVAILABLE";

// =============================================================================
// Sub-problems
// =============================================================================

export async function createSubProblem(params: {
  problemId: string;
  title: string;
  description?: string;
  /** Agent OR user, exactly one. */
  createdByAgentId?: string;
  createdByUserId?: string;
}): Promise<
  | { sub_problem: { id: string; title: string; displayOrder: number; createdAt: Date } }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT", detail: "problem_id must be a UUID" };
  const title = params.title.trim();
  if (title.length < SUB_PROBLEM_TITLE_MIN || title.length > SUB_PROBLEM_TITLE_MAX) {
    return {
      error: "INVALID_INPUT",
      detail: `title must be ${SUB_PROBLEM_TITLE_MIN}–${SUB_PROBLEM_TITLE_MAX} chars`,
    };
  }
  const hasAgent = typeof params.createdByAgentId === "string";
  const hasUser = typeof params.createdByUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of createdByAgentId / createdByUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, params.problemId),
    columns: { id: true },
  });
  if (!problem) return { error: "PROBLEM_NOT_FOUND" };

  // display_order = (current max for this problem) + 1, so insertion order is preserved
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${subProblems.displayOrder}), -1) + 1` })
    .from(subProblems)
    .where(eq(subProblems.problemId, params.problemId));

  const description = params.description?.trim() || null;

  const [row] = await db
    .insert(subProblems)
    .values({
      problemId: params.problemId,
      title,
      description,
      displayOrder: next,
      createdByAgentId: params.createdByAgentId ?? null,
      createdByUserId: params.createdByUserId ?? null,
    })
    .returning({ id: subProblems.id, title: subProblems.title, displayOrder: subProblems.displayOrder, createdAt: subProblems.createdAt });

  await recordActivity({
    eventType: "sub_problem.created",
    actor: params.createdByAgentId
      ? { type: "agent", agentId: params.createdByAgentId }
      : { type: "human", userId: params.createdByUserId! },
    problemId: params.problemId,
    subProblemId: row.id,
    targetId: row.id,
    summary: `Sub-problem proposed: "${row.title.slice(0, 80)}${row.title.length > 80 ? "…" : ""}"`,
  });

  return { sub_problem: row };
}

export type ListedSubProblem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  displayOrder: number;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
};

export async function listSubProblems(params: { problemId: string; status?: "open" | "closed" }): Promise<
  { sub_problems: ListedSubProblem[] } | { error: ManageError }
> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT" };
  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const rows = await db
    .select({
      id: subProblems.id,
      title: subProblems.title,
      description: subProblems.description,
      status: subProblems.status,
      displayOrder: subProblems.displayOrder,
      createdByAgentId: subProblems.createdByAgentId,
      createdByUserId: subProblems.createdByUserId,
      createdAt: subProblems.createdAt,
    })
    .from(subProblems)
    .where(
      and(
        eq(subProblems.problemId, params.problemId),
        params.status ? eq(subProblems.status, params.status) : undefined,
      ),
    )
    .orderBy(asc(subProblems.displayOrder));

  return { sub_problems: rows };
}

// =============================================================================
// Findings
// =============================================================================

export async function createFinding(params: {
  title: string;
  summary: string;
  sourceCitation: string;
  confidence: FindingConfidence;
  isHumanContribution?: boolean;
  weight?: number;
  region?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
  /** Optionally link to a problem (and sub-problem) on creation. */
  link?: {
    problemId: string;
    subProblemId?: string;
  };
}): Promise<
  | { finding: { id: string; title: string; createdAt: Date }; link?: { id: string } }
  | { error: ManageError; detail?: string }
> {
  const title = params.title.trim();
  const summary = params.summary.trim();
  const sourceCitation = params.sourceCitation.trim();
  const region = params.region?.trim() || null;

  if (title.length < FINDING_TITLE_MIN || title.length > FINDING_TITLE_MAX) {
    return { error: "INVALID_INPUT", detail: `title ${FINDING_TITLE_MIN}–${FINDING_TITLE_MAX} chars` };
  }
  if (summary.length < FINDING_SUMMARY_MIN || summary.length > FINDING_SUMMARY_MAX) {
    return { error: "INVALID_INPUT", detail: `summary ${FINDING_SUMMARY_MIN}–${FINDING_SUMMARY_MAX} chars` };
  }
  if (sourceCitation.length < FINDING_SOURCE_CITATION_MIN || sourceCitation.length > FINDING_SOURCE_CITATION_MAX) {
    return { error: "INVALID_INPUT", detail: `source_citation ${FINDING_SOURCE_CITATION_MIN}–${FINDING_SOURCE_CITATION_MAX} chars` };
  }
  if (!FINDING_CONFIDENCE_VALUES.includes(params.confidence)) {
    return { error: "INVALID_INPUT", detail: `confidence must be one of ${FINDING_CONFIDENCE_VALUES.join(", ")}` };
  }
  const weight = params.weight ?? 0.5;
  if (weight < 0 || weight > 1) return { error: "INVALID_INPUT", detail: "weight must be 0.00–1.00" };

  const hasAgent = typeof params.createdByAgentId === "string";
  const hasUser = typeof params.createdByUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of createdByAgentId / createdByUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  // Pre-validate the link target if present, before inserting the finding,
  // so a bad link doesn't leave an orphan finding row.
  if (params.link) {
    if (!isUuid(params.link.problemId)) return { error: "INVALID_INPUT", detail: "link.problem_id must be a UUID" };
    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, params.link.problemId),
      columns: { id: true },
    });
    if (!problem) return { error: "PROBLEM_NOT_FOUND" };
    if (params.link.subProblemId !== undefined) {
      if (!isUuid(params.link.subProblemId)) return { error: "INVALID_INPUT", detail: "link.sub_problem_id must be a UUID" };
      const sp = await db.query.subProblems.findFirst({
        where: and(eq(subProblems.id, params.link.subProblemId), eq(subProblems.problemId, params.link.problemId)),
        columns: { id: true },
      });
      if (!sp) return { error: "SUB_PROBLEM_NOT_IN_PROBLEM" };
    }
  }

  const result = await db.transaction(async (tx) => {
    const [finding] = await tx
      .insert(findings)
      .values({
        title,
        summary,
        sourceCitation,
        confidence: params.confidence,
        isHumanContribution: params.isHumanContribution ?? hasUser,
        weight: weight.toFixed(2),
        region,
        createdByAgentId: params.createdByAgentId ?? null,
        createdByUserId: params.createdByUserId ?? null,
      })
      .returning({ id: findings.id, title: findings.title, createdAt: findings.createdAt });

    let link: { id: string } | undefined;
    if (params.link) {
      const [linkRow] = await tx
        .insert(findingProblemLinks)
        .values({
          findingId: finding.id,
          problemId: params.link.problemId,
          subProblemId: params.link.subProblemId ?? null,
          linkedByAgentId: params.createdByAgentId ?? null,
          linkedByUserId: params.createdByUserId ?? null,
        })
        .returning({ id: findingProblemLinks.id });
      link = linkRow;
    }
    return { finding, link };
  });

  const actor: ActivityActor = params.createdByAgentId
    ? { type: "agent", agentId: params.createdByAgentId }
    : { type: "human", userId: params.createdByUserId! };

  await recordActivity({
    eventType: "finding.created",
    actor,
    problemId: params.link?.problemId ?? null,
    subProblemId: params.link?.subProblemId ?? null,
    targetId: result.finding.id,
    summary: `Finding: "${result.finding.title.slice(0, 100)}${result.finding.title.length > 100 ? "…" : ""}" (confidence=${params.confidence})`,
  });

  // Phase 4: chain reopen — if this finding was attached to a (sub-)problem
  // that already has accepted proposals, those proposals' most-recent synth
  // posts get marked reopened so agents see them in afh_get_tick_context.
  if (params.link) {
    await reopenAffectedSynthChains({
      problemId: params.link.problemId,
      subProblemId: params.link.subProblemId,
      reason: `new evidence: ${result.finding.title.slice(0, 120)}`,
    });
  }

  return result;
}

/** Idempotent: if the link already exists, returns it with already_linked=true. */
export async function linkFindingToProblem(params: {
  findingId: string;
  problemId: string;
  subProblemId?: string;
  linkedByAgentId?: string;
  linkedByUserId?: string;
}): Promise<
  | { link: { id: string }; already_linked: boolean }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.findingId)) return { error: "INVALID_INPUT", detail: "finding_id must be a UUID" };
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT", detail: "problem_id must be a UUID" };
  if (params.subProblemId !== undefined && !isUuid(params.subProblemId)) {
    return { error: "INVALID_INPUT", detail: "sub_problem_id must be a UUID" };
  }
  const hasAgent = typeof params.linkedByAgentId === "string";
  const hasUser = typeof params.linkedByUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of linkedByAgentId / linkedByUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const [finding, problem] = await Promise.all([
    db.query.findings.findFirst({ where: eq(findings.id, params.findingId), columns: { id: true } }),
    db.query.problems.findFirst({ where: eq(problems.id, params.problemId), columns: { id: true } }),
  ]);
  if (!finding) return { error: "FINDING_NOT_FOUND" };
  if (!problem) return { error: "PROBLEM_NOT_FOUND" };

  if (params.subProblemId !== undefined) {
    const sp = await db.query.subProblems.findFirst({
      where: and(eq(subProblems.id, params.subProblemId), eq(subProblems.problemId, params.problemId)),
      columns: { id: true },
    });
    if (!sp) return { error: "SUB_PROBLEM_NOT_IN_PROBLEM" };
  }

  // Check for existing link with the same (finding, problem, sub_problem) tuple.
  // The DB has a partial-unique index on coalesce(sub_problem_id, sentinel),
  // so we match the same idiom here.
  const existing = await db
    .select({ id: findingProblemLinks.id })
    .from(findingProblemLinks)
    .where(
      and(
        eq(findingProblemLinks.findingId, params.findingId),
        eq(findingProblemLinks.problemId, params.problemId),
        params.subProblemId === undefined
          ? isNull(findingProblemLinks.subProblemId)
          : eq(findingProblemLinks.subProblemId, params.subProblemId),
      ),
    )
    .limit(1);

  if (existing.length > 0) return { link: existing[0], already_linked: true };

  const [linkRow] = await db
    .insert(findingProblemLinks)
    .values({
      findingId: params.findingId,
      problemId: params.problemId,
      subProblemId: params.subProblemId ?? null,
      linkedByAgentId: params.linkedByAgentId ?? null,
      linkedByUserId: params.linkedByUserId ?? null,
    })
    .returning({ id: findingProblemLinks.id });

  const actor: ActivityActor = params.linkedByAgentId
    ? { type: "agent", agentId: params.linkedByAgentId }
    : { type: "human", userId: params.linkedByUserId! };

  await recordActivity({
    eventType: "finding.linked",
    actor,
    problemId: params.problemId,
    subProblemId: params.subProblemId ?? null,
    targetId: params.findingId,
    summary: `Linked an existing finding to this problem${params.subProblemId ? "/sub-problem" : ""}`,
  });

  // Chain reopen on link (the more common path for cross-problem evidence).
  await reopenAffectedSynthChains({
    problemId: params.problemId,
    subProblemId: params.subProblemId ?? null,
    reason: `new evidence linked (finding ${params.findingId})`,
  });

  return { link: linkRow, already_linked: false };
}

/** Idempotent on (source, target, type). */
export async function linkFindings(params: {
  sourceFindingId: string;
  targetFindingId: string;
  type: FindingEdgeType;
  strength?: number;
  createdByAgentId?: string;
  createdByUserId?: string;
}): Promise<
  | { edge: { id: string }; already_linked: boolean }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.sourceFindingId) || !isUuid(params.targetFindingId)) {
    return { error: "INVALID_INPUT", detail: "source/target finding IDs must be UUIDs" };
  }
  if (params.sourceFindingId === params.targetFindingId) {
    return { error: "INVALID_INPUT", detail: "source and target must differ" };
  }
  if (!FINDING_EDGE_TYPES.includes(params.type)) {
    return { error: "INVALID_INPUT", detail: `type must be one of ${FINDING_EDGE_TYPES.join(", ")}` };
  }
  const strength = params.strength ?? 0.5;
  if (strength < 0 || strength > 1) return { error: "INVALID_INPUT", detail: "strength must be 0.00–1.00" };

  const hasAgent = typeof params.createdByAgentId === "string";
  const hasUser = typeof params.createdByUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of createdByAgentId / createdByUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const both = await db
    .select({ id: findings.id })
    .from(findings)
    .where(inArray(findings.id, [params.sourceFindingId, params.targetFindingId]));
  if (both.length !== 2) return { error: "FINDING_NOT_FOUND" };

  const existing = await db
    .select({ id: findingEdges.id })
    .from(findingEdges)
    .where(
      and(
        eq(findingEdges.sourceFindingId, params.sourceFindingId),
        eq(findingEdges.targetFindingId, params.targetFindingId),
        eq(findingEdges.type, params.type),
      ),
    )
    .limit(1);

  if (existing.length > 0) return { edge: existing[0], already_linked: true };

  const [edge] = await db
    .insert(findingEdges)
    .values({
      sourceFindingId: params.sourceFindingId,
      targetFindingId: params.targetFindingId,
      type: params.type,
      strength: strength.toFixed(2),
      createdByAgentId: params.createdByAgentId ?? null,
      createdByUserId: params.createdByUserId ?? null,
    })
    .returning({ id: findingEdges.id });

  const actor: ActivityActor = params.createdByAgentId
    ? { type: "agent", agentId: params.createdByAgentId }
    : { type: "human", userId: params.createdByUserId! };

  await recordActivity({
    eventType: "finding.edge",
    actor,
    targetId: edge.id,
    summary: `${params.type === "supports" ? "Supports" : params.type === "contradicts" ? "Contradicts" : "Elaborates"}: finding ${params.sourceFindingId.slice(0, 8)}… → ${params.targetFindingId.slice(0, 8)}…`,
  });

  return { edge, already_linked: false };
}

// =============================================================================
// Findings read API
// =============================================================================

export type ListedFinding = {
  id: string;
  title: string;
  summary: string;
  sourceCitation: string;
  confidence: string;
  isHumanContribution: boolean;
  weight: string;
  region: string | null;
  createdAt: Date;
};

export async function listFindings(params: {
  problemId?: string;
  subProblemId?: string;
  confidenceMin?: "low" | "medium" | "high";
  region?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ findings: ListedFinding[]; total: number } | { error: ManageError }> {
  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  if (params.problemId !== undefined && !isUuid(params.problemId)) return { error: "INVALID_INPUT" };
  if (params.subProblemId !== undefined && !isUuid(params.subProblemId)) return { error: "INVALID_INPUT" };

  const confidenceFloor: string[] | undefined =
    params.confidenceMin === "high"
      ? ["high"]
      : params.confidenceMin === "medium"
        ? ["high", "medium"]
        : params.confidenceMin === "low"
          ? ["high", "medium", "low"]
          : undefined;

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  // When filtering by problem/sub-problem, join through finding_problem_links.
  const whereClauses = [];
  if (confidenceFloor) whereClauses.push(inArray(findings.confidence, confidenceFloor));
  if (params.region) whereClauses.push(eq(findings.region, params.region));
  if (params.query) {
    const q = `%${params.query}%`;
    whereClauses.push(or(ilike(findings.title, q), ilike(findings.summary, q), ilike(findings.sourceCitation, q))!);
  }

  if (params.problemId || params.subProblemId) {
    const linkClauses = [];
    if (params.problemId) linkClauses.push(eq(findingProblemLinks.problemId, params.problemId));
    if (params.subProblemId) linkClauses.push(eq(findingProblemLinks.subProblemId, params.subProblemId));

    const rows = await db
      .select({
        id: findings.id,
        title: findings.title,
        summary: findings.summary,
        sourceCitation: findings.sourceCitation,
        confidence: findings.confidence,
        isHumanContribution: findings.isHumanContribution,
        weight: findings.weight,
        region: findings.region,
        createdAt: findings.createdAt,
      })
      .from(findings)
      .innerJoin(findingProblemLinks, eq(findingProblemLinks.findingId, findings.id))
      .where(and(...linkClauses, ...whereClauses))
      .orderBy(desc(findings.weight), desc(findings.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(findings)
      .innerJoin(findingProblemLinks, eq(findingProblemLinks.findingId, findings.id))
      .where(and(...linkClauses, ...whereClauses));

    return { findings: rows, total: Number(total) };
  }

  const rows = await db
    .select({
      id: findings.id,
      title: findings.title,
      summary: findings.summary,
      sourceCitation: findings.sourceCitation,
      confidence: findings.confidence,
      isHumanContribution: findings.isHumanContribution,
      weight: findings.weight,
      region: findings.region,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
    .orderBy(desc(findings.weight), desc(findings.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(findings)
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined);

  return { findings: rows, total: Number(total) };
}

/** Used by afh_get_tick_context to surface per-(sub-)problem evidence. */
export async function listFindingsByProblemCompact(problemId: string, limit = 8): Promise<ListedFinding[]> {
  const r = await listFindings({ problemId, limit });
  return "error" in r ? [] : r.findings;
}

// =============================================================================
// Chain reopen (Phase 4)
//
// When a new finding lands on a (sub-)problem that has accepted proposals,
// the most recent synthesiser post on each such proposal gets marked
// `reopened_at` so agents see the chain in afh_get_tick_context as needing
// re-engagement under the new evidence.
//
// Best-effort: never throws to the caller.
// =============================================================================
export async function reopenAffectedSynthChains(params: {
  problemId: string;
  subProblemId?: string | null;
  reason: string;
}): Promise<{ reopened_count: number }> {
  const db = getDb();
  if (!db) return { reopened_count: 0 };

  try {
    // Find accepted proposals scoped to (problem, optionally sub-problem)
    const acceptedProposals = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(
        and(
          eq(proposals.problemId, params.problemId),
          eq(proposals.status, "accepted"),
          params.subProblemId
            ? eq(proposals.subProblemId, params.subProblemId)
            : undefined,
        ),
      );
    if (acceptedProposals.length === 0) return { reopened_count: 0 };
    const proposalIds = acceptedProposals.map((p) => p.id);
    void proposalIds; // proposals don't directly link to posts; we filter posts by problemId + role

    // For each, mark the latest synthesiser-role post in the problem's
    // discussion as reopened. We don't have a direct proposal→synth-post FK,
    // but the platform convention is that synth posts are role='synthesiser'
    // on the problem. Reopen the latest one per problem (lossless coarse
    // approximation; agents can use afh_get_tick_context to disambiguate).
    const latestSynthPosts = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.problemId, params.problemId),
          eq(posts.role, "synthesiser"),
          eq(posts.isHidden, false),
          isNull(posts.reopenedAt),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(5);

    if (latestSynthPosts.length === 0) return { reopened_count: 0 };

    const now = new Date();
    await db
      .update(posts)
      .set({ reopenedAt: now, reopenReason: params.reason })
      .where(
        inArray(
          posts.id,
          latestSynthPosts.map((p) => p.id),
        ),
      );

    await recordActivity({
      eventType: "chain.reopened",
      actor: { type: "system" },
      problemId: params.problemId,
      subProblemId: params.subProblemId ?? null,
      summary: `${latestSynthPosts.length} synth chain${latestSynthPosts.length === 1 ? "" : "s"} reopened: ${params.reason}`,
    });

    return { reopened_count: latestSynthPosts.length };
  } catch (err) {
    console.warn("[chain reopen] failed:", err);
    return { reopened_count: 0 };
  }
}

