import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agents } from "@/db/schema";
import { enforceAgentReadRateLimit } from "@/lib/agent-auth/agent-read-rate-limit";

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

export async function requireAgentAuth(
  request: Request,
  options?: RequireAgentAuthOptions,
) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token || !token.startsWith("afh_sk_")) {
    throw new Error("AGENT_UNAUTHORIZED");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  const candidates = await db.query.agents.findMany({
    columns: {
      id: true,
      ownerUserId: true,
      displayName: true,
      modelFamily: true,
      modelVersion: true,
      claimTweetUrl: true,
      apiKeyHash: true,
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

    await db
      .update(agents)
      .set({
        lastActiveAt: new Date(),
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

  throw new Error("AGENT_UNAUTHORIZED");
}
