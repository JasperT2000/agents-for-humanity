import { and, asc, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { perspectives, problems } from "@/db/schema";
import { recordActivity, type ActivityActor } from "@/lib/activity/record";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const PERSPECTIVE_LABEL_MIN = 2;
export const PERSPECTIVE_LABEL_MAX = 60;
export const PERSPECTIVE_DESC_MAX = 500;
/** Bulk form_council action: matches the decompose_problem range. */
export const FORM_COUNCIL_MIN_PERSPECTIVES = 2;
export const FORM_COUNCIL_MAX_PERSPECTIVES = 12;

export const PERSPECTIVE_STATUS_VALUES = ["empty", "active", "filled"] as const;
export type PerspectiveStatus = (typeof PERSPECTIVE_STATUS_VALUES)[number];

export type ManageError =
  | "PROBLEM_NOT_FOUND"
  | "PERSPECTIVE_NOT_FOUND"
  | "PERSPECTIVE_NOT_IN_PROBLEM"
  | "DUPLICATE_LABEL"
  | "ALREADY_FILLED"
  | "ALREADY_FILLED_BY_YOU"
  | "INVALID_INPUT"
  | "DATABASE_UNAVAILABLE";

// =============================================================================
// Create
// =============================================================================

export async function createPerspective(params: {
  problemId: string;
  label: string;
  description?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
}): Promise<
  | { perspective: { id: string; label: string; status: PerspectiveStatus; createdAt: Date } }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT", detail: "problem_id must be a UUID" };
  const label = params.label.trim();
  if (label.length < PERSPECTIVE_LABEL_MIN || label.length > PERSPECTIVE_LABEL_MAX) {
    return {
      error: "INVALID_INPUT",
      detail: `label must be ${PERSPECTIVE_LABEL_MIN}–${PERSPECTIVE_LABEL_MAX} chars`,
    };
  }
  const description = params.description?.trim() || null;
  if (description && description.length > PERSPECTIVE_DESC_MAX) {
    return { error: "INVALID_INPUT", detail: `description must be ≤${PERSPECTIVE_DESC_MAX} chars` };
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

  // Pre-check the case-insensitive unique constraint so we return a friendly
  // error instead of a raw DB error.
  const dup = await db
    .select({ id: perspectives.id })
    .from(perspectives)
    .where(and(eq(perspectives.problemId, params.problemId), sql`lower(${perspectives.label}) = lower(${label})`));
  if (dup.length > 0) {
    return { error: "DUPLICATE_LABEL", detail: `"${label}" already exists on this problem` };
  }

  const [row] = await db
    .insert(perspectives)
    .values({
      problemId: params.problemId,
      label,
      description,
      status: "empty",
      createdByAgentId: params.createdByAgentId ?? null,
      createdByUserId: params.createdByUserId ?? null,
    })
    .returning({ id: perspectives.id, label: perspectives.label, status: perspectives.status, createdAt: perspectives.createdAt });

  const actor: ActivityActor = params.createdByAgentId
    ? { type: "agent", agentId: params.createdByAgentId }
    : { type: "human", userId: params.createdByUserId! };
  await recordActivity({
    eventType: "perspective.created",
    actor,
    problemId: params.problemId,
    targetId: row.id,
    summary: `Perspective opened: "${row.label}" (seat empty; awaiting claimant)`,
  });

  return {
    perspective: {
      id: row.id,
      label: row.label,
      status: row.status as PerspectiveStatus,
      createdAt: row.createdAt,
    },
  };
}

// =============================================================================
// Form council — single-act bulk perspective creation (Phase 5, perspectives-
// per-action). Mirrors decompose_problem: the council-former proposes the
// FULL set of viewpoints at the table in one atomic call. Rejected if the
// problem already has any perspectives — use createPerspective for
// incremental additions after the council is formed.
// =============================================================================

export async function formCouncil(params: {
  problemId: string;
  perspectives: Array<{ label: string; description?: string }>;
  createdByAgentId?: string;
  createdByUserId?: string;
}): Promise<
  | {
      perspectives: Array<{
        id: string;
        label: string;
        status: PerspectiveStatus;
        createdAt: Date;
      }>;
    }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT", detail: "problem_id must be a UUID" };
  if (!Array.isArray(params.perspectives)) {
    return { error: "INVALID_INPUT", detail: "perspectives must be an array of {label, description?}" };
  }
  if (params.perspectives.length < FORM_COUNCIL_MIN_PERSPECTIVES) {
    return {
      error: "INVALID_INPUT",
      detail: `form_council requires ≥${FORM_COUNCIL_MIN_PERSPECTIVES} perspectives (got ${params.perspectives.length}); use create_perspective for incremental adds`,
    };
  }
  if (params.perspectives.length > FORM_COUNCIL_MAX_PERSPECTIVES) {
    return {
      error: "INVALID_INPUT",
      detail: `form_council allows at most ${FORM_COUNCIL_MAX_PERSPECTIVES} perspectives per call (got ${params.perspectives.length})`,
    };
  }

  const normalised: Array<{ label: string; description: string | null }> = [];
  const seenLowercase = new Set<string>();
  for (let i = 0; i < params.perspectives.length; i++) {
    const raw = params.perspectives[i];
    const label = (raw?.label ?? "").trim();
    if (label.length < PERSPECTIVE_LABEL_MIN || label.length > PERSPECTIVE_LABEL_MAX) {
      return {
        error: "INVALID_INPUT",
        detail: `perspectives[${i}].label must be ${PERSPECTIVE_LABEL_MIN}–${PERSPECTIVE_LABEL_MAX} chars (got ${label.length})`,
      };
    }
    const lower = label.toLowerCase();
    if (seenLowercase.has(lower)) {
      return {
        error: "INVALID_INPUT",
        detail: `perspectives[${i}].label duplicates an earlier entry (case-insensitive) — each voice must be distinct`,
      };
    }
    seenLowercase.add(lower);
    const description = raw?.description?.trim() || null;
    if (description && description.length > PERSPECTIVE_DESC_MAX) {
      return { error: "INVALID_INPUT", detail: `perspectives[${i}].description must be ≤${PERSPECTIVE_DESC_MAX} chars` };
    }
    normalised.push({ label, description });
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

  // form_council is a first-act. Reject if any perspective already exists.
  const [{ existing }] = await db
    .select({ existing: sql<number>`count(*)` })
    .from(perspectives)
    .where(eq(perspectives.problemId, params.problemId));
  if (Number(existing) > 0) {
    return {
      error: "INVALID_INPUT",
      detail: `Council already exists (${existing} perspective(s)). Use create_perspective for incremental additions; form_council is the first-act bulk creation.`,
    };
  }

  const inserted = await db.transaction(async (tx) => {
    return tx
      .insert(perspectives)
      .values(
        normalised.map((p) => ({
          problemId: params.problemId,
          label: p.label,
          description: p.description,
          status: "empty",
          createdByAgentId: params.createdByAgentId ?? null,
          createdByUserId: params.createdByUserId ?? null,
        })),
      )
      .returning({
        id: perspectives.id,
        label: perspectives.label,
        status: perspectives.status,
        createdAt: perspectives.createdAt,
      });
  });

  await recordActivity({
    eventType: "council.formed",
    actor: params.createdByAgentId
      ? { type: "agent", agentId: params.createdByAgentId }
      : { type: "human", userId: params.createdByUserId! },
    problemId: params.problemId,
    targetId: params.problemId,
    summary: `Council formed (${inserted.length} viewpoints): ${inserted.map((p) => p.label).join(" · ")}`,
  });

  return {
    perspectives: inserted.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status as PerspectiveStatus,
      createdAt: row.createdAt,
    })),
  };
}

/**
 * Phase 5 (perspectives-per-action): validates that a perspective exists on
 * the given problem. Replaces the older ownership-based resolveOwnedPerspective
 * check — under the new model, ANY agent can attribute an action to any
 * perspective on the problem (no persistent claim).
 */
export async function resolvePerspectiveForProblem(
  perspectiveId: string,
  problemId: string,
): Promise<{ perspective: { id: string; label: string } } | { error: ManageError }> {
  if (!isUuid(perspectiveId) || !isUuid(problemId)) return { error: "INVALID_INPUT" };
  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const row = await db.query.perspectives.findFirst({
    where: eq(perspectives.id, perspectiveId),
    columns: { id: true, label: true, problemId: true },
  });
  if (!row) return { error: "PERSPECTIVE_NOT_FOUND" };
  if (row.problemId !== problemId) return { error: "PERSPECTIVE_NOT_IN_PROBLEM" };
  return { perspective: { id: row.id, label: row.label } };
}

// =============================================================================
// Claim — DEPRECATED in Phase 5 (perspectives-per-action). Perspectives no
// longer need to be claimed; agents pass perspective_id directly on each
// post/vote/proposal. Kept here as a no-op for back-compat with older
// callers; new code should not use it.
// =============================================================================

export async function claimPerspective(params: {
  perspectiveId: string;
  claimedByAgentId?: string;
  claimedByUserId?: string;
}): Promise<
  | { perspective: { id: string; label: string; status: PerspectiveStatus; filledByAgentId: string | null; filledByUserId: string | null } }
  | { error: ManageError; detail?: string }
> {
  if (!isUuid(params.perspectiveId)) return { error: "INVALID_INPUT", detail: "perspective_id must be a UUID" };
  const hasAgent = typeof params.claimedByAgentId === "string";
  const hasUser = typeof params.claimedByUserId === "string";
  if (hasAgent === hasUser) return { error: "INVALID_INPUT", detail: "exactly one of claimedByAgentId / claimedByUserId" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const existing = await db.query.perspectives.findFirst({
    where: eq(perspectives.id, params.perspectiveId),
    columns: {
      id: true,
      label: true,
      status: true,
      filledByAgentId: true,
      filledByUserId: true,
    },
  });
  if (!existing) return { error: "PERSPECTIVE_NOT_FOUND" };

  if (existing.status !== "empty") {
    const youAlready = params.claimedByAgentId && existing.filledByAgentId === params.claimedByAgentId;
    if (youAlready) {
      return {
        error: "ALREADY_FILLED_BY_YOU",
        detail: `You already hold the "${existing.label}" perspective on this problem.`,
      };
    }
    return {
      error: "ALREADY_FILLED",
      detail: `"${existing.label}" is already ${existing.status}.`,
    };
  }

  const now = new Date();
  await db
    .update(perspectives)
    .set({
      status: "active",
      filledByAgentId: params.claimedByAgentId ?? null,
      filledByUserId: params.claimedByUserId ?? null,
      activeSince: now,
      updatedAt: now,
    })
    .where(eq(perspectives.id, params.perspectiveId));

  // We need the problemId for the activity row; fetch it from existing.
  const pr = await db.query.perspectives.findFirst({
    where: eq(perspectives.id, params.perspectiveId),
    columns: { problemId: true },
  });
  const actor: ActivityActor = params.claimedByAgentId
    ? { type: "agent", agentId: params.claimedByAgentId }
    : { type: "human", userId: params.claimedByUserId! };
  await recordActivity({
    eventType: "perspective.claimed",
    actor,
    problemId: pr?.problemId ?? null,
    targetId: existing.id,
    summary: `Perspective claimed: "${existing.label}" is now active`,
  });

  return {
    perspective: {
      id: existing.id,
      label: existing.label,
      status: "active",
      filledByAgentId: params.claimedByAgentId ?? null,
      filledByUserId: params.claimedByUserId ?? null,
    },
  };
}

/**
 * Phase 5 (perspectives-per-action): bumps a perspective to "filled" on the
 * first post attributed to it (by ANY agent — no ownership). Idempotent.
 * Transitions from either "empty" or "active" (legacy state). No-op if
 * already "filled".
 */
export async function markPerspectiveFilled(perspectiveId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(perspectives)
    .set({ status: "filled", updatedAt: new Date() })
    .where(and(eq(perspectives.id, perspectiveId), ne(perspectives.status, "filled")));
}

// =============================================================================
// Read
// =============================================================================

export type ListedPerspective = {
  id: string;
  label: string;
  description: string | null;
  status: PerspectiveStatus;
  filledByAgentId: string | null;
  filledByUserId: string | null;
  activeSince: Date | null;
  createdAt: Date;
};

export async function listPerspectives(params: {
  problemId: string;
  status?: PerspectiveStatus;
}): Promise<{ perspectives: ListedPerspective[] } | { error: ManageError }> {
  if (!isUuid(params.problemId)) return { error: "INVALID_INPUT" };
  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const rows = await db
    .select({
      id: perspectives.id,
      label: perspectives.label,
      description: perspectives.description,
      status: perspectives.status,
      filledByAgentId: perspectives.filledByAgentId,
      filledByUserId: perspectives.filledByUserId,
      activeSince: perspectives.activeSince,
      createdAt: perspectives.createdAt,
    })
    .from(perspectives)
    .where(
      and(
        eq(perspectives.problemId, params.problemId),
        params.status ? eq(perspectives.status, params.status) : undefined,
      ),
    )
    .orderBy(asc(perspectives.createdAt));

  return {
    perspectives: rows.map((r) => ({
      ...r,
      status: r.status as PerspectiveStatus,
    })),
  };
}

/**
 * Resolves a perspective_id from a post context — returns the row IF it
 * belongs to the given problem AND is owned by the given agent (or user).
 * Used by the post handler to validate `perspective_id` on insert.
 */
/**
 * Phase 5 (council-quorum): which perspective does this agent currently hold
 * on the given problem? Returns null if the agent hasn't claimed any
 * perspective on the problem. Used by the vote gates to attribute each vote
 * to a perspective without the caller having to pass perspective_id.
 */
export async function findPerspectiveHeldByAgent(
  problemId: string,
  agentId: string,
): Promise<{ id: string; label: string; status: PerspectiveStatus } | null> {
  if (!isUuid(problemId) || !isUuid(agentId)) return null;
  const db = getDb();
  if (!db) return null;

  const row = await db.query.perspectives.findFirst({
    where: and(
      eq(perspectives.problemId, problemId),
      eq(perspectives.filledByAgentId, agentId),
    ),
    columns: { id: true, label: true, status: true },
  });
  if (!row) return null;
  return { id: row.id, label: row.label, status: row.status as PerspectiveStatus };
}

export async function resolveOwnedPerspective(params: {
  perspectiveId: string;
  problemId: string;
  ownerAgentId?: string;
  ownerUserId?: string;
}): Promise<
  | { perspective: { id: string; label: string; status: PerspectiveStatus } }
  | { error: ManageError }
> {
  if (!isUuid(params.perspectiveId)) return { error: "INVALID_INPUT" };

  const db = getDb();
  if (!db) return { error: "DATABASE_UNAVAILABLE" };

  const p = await db.query.perspectives.findFirst({
    where: eq(perspectives.id, params.perspectiveId),
    columns: {
      id: true,
      problemId: true,
      label: true,
      status: true,
      filledByAgentId: true,
      filledByUserId: true,
    },
  });
  if (!p) return { error: "PERSPECTIVE_NOT_FOUND" };
  if (p.problemId !== params.problemId) return { error: "PERSPECTIVE_NOT_IN_PROBLEM" };

  // Posting under this perspective requires being its current filler.
  const isOwner =
    (params.ownerAgentId && p.filledByAgentId === params.ownerAgentId) ||
    (params.ownerUserId && p.filledByUserId === params.ownerUserId);
  if (!isOwner) return { error: "PERSPECTIVE_NOT_IN_PROBLEM" }; // reuse code; caller maps to friendly msg

  return { perspective: { id: p.id, label: p.label, status: p.status as PerspectiveStatus } };
}
