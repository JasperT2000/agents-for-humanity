import { compare, hash } from "bcryptjs";
import { eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { agents } from "@/db/schema";
import { enforceAgentReadRateLimit } from "@/lib/agent-auth/agent-read-rate-limit";
import { extractApiKeyPrefix } from "@/lib/agent-auth/api-key-prefix";

export type RequireAgentAuthOptions = {
  /** Default true. Set false for GET contract (spec: not rate limited). */
  applyReadRateLimit?: boolean;
};

function readBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

// One-time-computed bcrypt hash of a sentinel value. Used to keep the
// auth-failure path running for roughly the same wall-clock time as the
// success path so a timing oracle can't distinguish "no such token" from
// "wrong token". Computing it lazily avoids a 12-round bcrypt at module load.
let cachedDummyHash: string | undefined;
async function getDummyHash() {
  if (!cachedDummyHash) {
    cachedDummyHash = await hash("dummy-token-for-constant-time-defense", 12);
  }
  return cachedDummyHash;
}

const AGENT_AUTH_COLUMNS = {
  id: true,
  ownerUserId: true,
  displayName: true,
  modelFamily: true,
  modelVersion: true,
  claimTweetUrl: true,
  apiKeyHash: true,
  apiKeyPrefix: true,
  reputationScore: true,
  postCount: true,
  flagCount: true,
  status: true,
  createdAt: true,
  lastActiveAt: true,
} as const;

type AgentRow = {
  id: string;
  ownerUserId: string;
  displayName: string;
  modelFamily: string;
  modelVersion: string | null;
  claimTweetUrl: string | null;
  apiKeyHash: string;
  apiKeyPrefix: string | null;
  reputationScore: number;
  postCount: number;
  flagCount: number;
  status: string;
  createdAt: Date;
  lastActiveAt: Date;
};

type Db = NonNullable<ReturnType<typeof getDb>>;

/**
 * Walks `candidates`, bcrypt-comparing `token` against each. On match: enforces
 * status, refreshes lastActiveAt, opportunistically backfills the api_key_prefix
 * for legacy rows, applies the read rate limit, and returns the agent. Returns
 * null when no row matched (caller handles fallback / dummy-bcrypt + throw).
 */
async function tryMatchCandidates(
  db: Db,
  candidates: AgentRow[],
  token: string,
  prefix: string,
  options: RequireAgentAuthOptions | undefined,
) {
  for (const candidate of candidates) {
    const match = await compare(token, candidate.apiKeyHash);
    if (!match) continue;

    if (candidate.status !== "active") {
      throw new Error("AGENT_FORBIDDEN");
    }

    const needsPrefixBackfill = candidate.apiKeyPrefix === null;
    await db
      .update(agents)
      .set({
        lastActiveAt: new Date(),
        ...(needsPrefixBackfill ? { apiKeyPrefix: prefix } : {}),
      })
      .where(eq(agents.id, candidate.id));

    if (options?.applyReadRateLimit !== false) {
      await enforceAgentReadRateLimit(candidate.id);
    }

    return {
      id: candidate.id,
      ownerUserId: candidate.ownerUserId,
      displayName: candidate.displayName,
      modelFamily: candidate.modelFamily,
      modelVersion: candidate.modelVersion,
      claimTweetUrl: candidate.claimTweetUrl,
      reputationScore: candidate.reputationScore,
      postCount: candidate.postCount,
      flagCount: candidate.flagCount,
      status: candidate.status,
      createdAt: candidate.createdAt,
      lastActiveAt: candidate.lastActiveAt,
    };
  }
  return null;
}

export async function requireAgentAuth(
  request: Request,
  options?: RequireAgentAuthOptions,
) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token || !token.startsWith("afh_sk_")) {
    // Run a bcrypt anyway so the malformed-token path takes ~the same time
    // as the valid-format-but-wrong-token path. Defeats timing oracles.
    await compare("noop", await getDummyHash());
    throw new Error("AGENT_UNAUTHORIZED");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  const prefix = extractApiKeyPrefix(token);
  if (!prefix) {
    // Well-formed afh_sk_ but shorter than the prefix length — can't match
    // any real key. Still bcrypt for constant-time defense.
    await compare(token, await getDummyHash());
    throw new Error("AGENT_UNAUTHORIZED");
  }

  // FAST PATH — indexed lookup by prefix. With 12 hex chars (48-bit space),
  // collisions are statistically nonexistent — almost always 0 or 1 row.
  // Agents whose prefix is populated finish auth in a single bcrypt.
  const indexed = await db.query.agents.findMany({
    where: eq(agents.apiKeyPrefix, prefix),
    columns: AGENT_AUTH_COLUMNS,
  });

  const fastMatched = await tryMatchCandidates(db, indexed, token, prefix, options);
  if (fastMatched) return fastMatched;

  // SLOW PATH — legacy agents whose prefix hasn't been backfilled yet. This
  // pool shrinks every time one of them successfully auths (tryMatchCandidates
  // populates the prefix on match). Eventually drains to zero and this branch
  // becomes a no-op.
  const legacy = await db.query.agents.findMany({
    where: isNull(agents.apiKeyPrefix),
    columns: AGENT_AUTH_COLUMNS,
  });

  const legacyMatched = await tryMatchCandidates(db, legacy, token, prefix, options);
  if (legacyMatched) return legacyMatched;

  // No candidate matched. Run a bcrypt against the dummy hash so the
  // no-match path runs in roughly constant time vs the match path.
  await compare(token, await getDummyHash());
  throw new Error("AGENT_UNAUTHORIZED");
}
