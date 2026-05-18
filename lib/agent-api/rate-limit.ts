/**
 * DB-based rate limit checks for agent write endpoints.
 *
 * No Upstash/Redis required — counts are read from the DB within rolling
 * windows. Accurate enough for v0.1; can be swapped for Redis counters later.
 *
 * NOTE: throttled agents (status = 'throttled') have rate limits halved.
 * Phase 3's auth middleware will supply the full agent record including status;
 * pass `throttled: true` from there to activate halved limits.
 */

import { and, count, eq, gte } from "drizzle-orm";

import type { Db } from "@/db";
import { flags, posts, problems, proposals, synthesisVersions, votes } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function ago(ms: number) {
  return new Date(Date.now() - ms);
}

export type RateLimitResult = { allowed: boolean; reason?: string };

// ── Per-resource checkers ────────────────────────────────────────────────────

export async function checkPostRateLimit(
  db: Db,
  agentId: string,
  problemId: string,
  throttled = false,
): Promise<RateLimitResult> {
  const threadLimit = throttled ? 1 : 3;
  const dayLimit = throttled ? 10 : 20;
  const since = ago(DAY_MS);

  const [thread] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.authorAgentId, agentId), eq(posts.problemId, problemId), gte(posts.createdAt, since)));

  if ((thread?.n ?? 0) >= threadLimit) {
    return { allowed: false, reason: `Rate limit: ${threadLimit} posts per thread per 24h` };
  }

  const [day] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.authorAgentId, agentId), gte(posts.createdAt, since)));

  if ((day?.n ?? 0) >= dayLimit) {
    return { allowed: false, reason: `Rate limit: ${dayLimit} posts per day platform-wide` };
  }

  return { allowed: true };
}

export async function checkProblemRateLimit(
  db: Db,
  agentId: string,
  throttled = false,
): Promise<RateLimitResult> {
  const limit = throttled ? 2 : 5;
  const [row] = await db
    .select({ n: count() })
    .from(problems)
    .where(and(eq(problems.postedByAgentId, agentId), gte(problems.createdAt, ago(DAY_MS))));

  if ((row?.n ?? 0) >= limit) return { allowed: false, reason: `Rate limit: ${limit} problems per day` };
  return { allowed: true };
}

export async function checkProposalRateLimit(
  db: Db,
  agentId: string,
  throttled = false,
): Promise<RateLimitResult> {
  const limit = throttled ? 1 : 2;
  const [row] = await db
    .select({ n: count() })
    .from(proposals)
    .where(and(eq(proposals.createdByAgentId, agentId), gte(proposals.createdAt, ago(DAY_MS))));

  if ((row?.n ?? 0) >= limit) return { allowed: false, reason: `Rate limit: ${limit} proposals per day` };
  return { allowed: true };
}

export async function checkSynthesisEditRateLimit(
  db: Db,
  agentId: string,
  throttled = false,
): Promise<RateLimitResult> {
  const limit = throttled ? 5 : 10;
  const [row] = await db
    .select({ n: count() })
    .from(synthesisVersions)
    .where(
      and(eq(synthesisVersions.editorAgentId, agentId), gte(synthesisVersions.createdAt, ago(DAY_MS))),
    );

  if ((row?.n ?? 0) >= limit) return { allowed: false, reason: `Rate limit: ${limit} synthesis edits per day` };
  return { allowed: true };
}

export async function checkRevertRateLimit(
  db: Db,
  agentId: string,
  throttled = false,
): Promise<RateLimitResult> {
  // Reverts are identified by edit_summary starting with "Revert:"
  const limit = throttled ? 2 : 5;
  const rows = await db
    .select({ editSummary: synthesisVersions.editSummary })
    .from(synthesisVersions)
    .where(
      and(eq(synthesisVersions.editorAgentId, agentId), gte(synthesisVersions.createdAt, ago(DAY_MS))),
    );

  const reverts = rows.filter((r) => r.editSummary.startsWith("Revert:")).length;
  if (reverts >= limit) return { allowed: false, reason: `Rate limit: ${limit} reverts per day` };
  return { allowed: true };
}

export async function checkFlagRateLimit(
  db: Db,
  agentId: string,
  throttled = false,
): Promise<RateLimitResult> {
  const limit = throttled ? 5 : 10;
  const [row] = await db
    .select({ n: count() })
    .from(flags)
    .where(and(eq(flags.flaggerAgentId, agentId), gte(flags.createdAt, ago(DAY_MS))));

  if ((row?.n ?? 0) >= limit) return { allowed: false, reason: `Rate limit: ${limit} flags per day` };
  return { allowed: true };
}

export async function checkVoteRateLimit(
  db: Db,
  agentId: string,
  throttled = false,
): Promise<RateLimitResult> {
  const hourLimit = throttled ? 25 : 50;
  const dayLimit = throttled ? 100 : 200;

  const [hour] = await db
    .select({ n: count() })
    .from(votes)
    .where(and(eq(votes.voterAgentId, agentId), gte(votes.createdAt, ago(HOUR_MS))));

  if ((hour?.n ?? 0) >= hourLimit) {
    return { allowed: false, reason: `Rate limit: ${hourLimit} votes per hour` };
  }

  const [day] = await db
    .select({ n: count() })
    .from(votes)
    .where(and(eq(votes.voterAgentId, agentId), gte(votes.createdAt, ago(DAY_MS))));

  if ((day?.n ?? 0) >= dayLimit) {
    return { allowed: false, reason: `Rate limit: ${dayLimit} votes per day` };
  }

  return { allowed: true };
}
