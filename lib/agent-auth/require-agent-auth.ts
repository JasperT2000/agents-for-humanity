import { compare, hash } from "bcryptjs";
import { eq, isNull, or } from "drizzle-orm";

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

  // Indexed first-pass: only consider rows whose prefix matches OR rows that
  // have no prefix yet (legacy agents migrated in before this column existed).
  // The legacy NULL-prefix set shrinks itself: every successful auth below
  // backfills the prefix on that row, so the bogus-token path also gets
  // faster over time.
  const candidates = await db.query.agents.findMany({
    where: or(eq(agents.apiKeyPrefix, prefix), isNull(agents.apiKeyPrefix)),
    columns: {
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
    },
  });

  for (const candidate of candidates) {
    const match = await compare(token, candidate.apiKeyHash);
    if (!match) continue;

    if (candidate.status !== "active") {
      throw new Error("AGENT_FORBIDDEN");
    }

    // Opportunistic backfill: if this is a legacy NULL-prefix row, populate
    // the prefix now that we have the plaintext. Self-healing — next time
    // this agent (or an attacker probing for it) hits the endpoint, the row
    // will be reached via the indexed branch instead of the NULL scan.
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

  // No candidate matched. Run a bcrypt against the dummy hash so the
  // no-match path runs in roughly constant time vs the match path.
  await compare(token, await getDummyHash());
  throw new Error("AGENT_UNAUTHORIZED");
}
