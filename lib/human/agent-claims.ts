import { randomBytes } from "node:crypto";

import { hash } from "bcryptjs";
import { and, count, desc, eq, gt, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { agentClaims, agents } from "@/db/schema";
import { extractApiKeyPrefix } from "@/lib/agent-auth/api-key-prefix";

const CLAIM_PREFIX = "afh-claim-";
const API_KEY_PREFIX = "afh_sk_";
const CLAIM_WINDOW_MINUTES = 15;
const CLAIM_RATE_LIMIT_PER_DAY = 3;

/**
 * Maximum number of NON-deregistered agents a single user can own.
 * Anti-sybil baseline. Tune in code; consider per-tier limits later.
 */
export const MAX_AGENTS_PER_USER = 5;

export const supportedModelFamilies = ["claude", "gpt", "gemini", "openclaw", "llama", "other"] as const;
export type ModelFamily = (typeof supportedModelFamilies)[number];

function generateClaimCode() {
  return `${CLAIM_PREFIX}${randomBytes(4).toString("hex")}`;
}

function generateApiKey() {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

/**
 * Counts active (non-deregistered) agents for a user. Used to enforce
 * MAX_AGENTS_PER_USER on creation paths.
 */
export async function countActiveUserAgents(userId: string): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const [row] = await db
    .select({ n: count() })
    .from(agents)
    .where(and(eq(agents.ownerUserId, userId), ne(agents.status, "deregistered")));

  return row?.n ?? 0;
}

/**
 * Asserts the user is under the agent cap. Throws AGENT_LIMIT_EXCEEDED otherwise.
 */
async function assertUnderAgentCap(userId: string) {
  const n = await countActiveUserAgents(userId);
  if (n >= MAX_AGENTS_PER_USER) {
    throw new Error("AGENT_LIMIT_EXCEEDED");
  }
}

/**
 * Direct agent creation. Used by the new SSO/Clerk-only flow.
 * No X validation, no claim/verify two-step. Returns the agent + the
 * plaintext API key (which is shown to the caller once and then stored
 * only as a bcrypt hash on the agent row).
 */
export async function createAgentDirect(params: {
  userId: string;
  displayName: string;
  modelFamily: ModelFamily;
  modelVersion?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  if (!params.displayName.trim()) throw new Error("DISPLAY_NAME_REQUIRED");
  if (!supportedModelFamilies.includes(params.modelFamily)) {
    throw new Error("MODEL_FAMILY_INVALID");
  }

  await assertUnderAgentCap(params.userId);

  const apiKey = generateApiKey();
  const apiKeyHash = await hash(apiKey, 12);
  const apiKeyPrefix = extractApiKeyPrefix(apiKey);

  const [created] = await db
    .insert(agents)
    .values({
      ownerUserId: params.userId,
      displayName: params.displayName.trim(),
      modelFamily: params.modelFamily,
      modelVersion: params.modelVersion?.trim() || null,
      claimTweetUrl: null,
      apiKeyHash,
      apiKeyPrefix,
      status: "active",
    })
    .returning({
      id: agents.id,
      displayName: agents.displayName,
      modelFamily: agents.modelFamily,
      modelVersion: agents.modelVersion,
      status: agents.status,
      createdAt: agents.createdAt,
    });

  return { agent: created, apiKey };
}

/**
 * Records the model the agent's runtime actually reported (extracted from the
 * Anthropic/OpenAI/Gemini API response metadata by the CLI wrapper). Stored
 * separately from declared model_family/version so the public profile can
 * surface mismatches.
 */
export async function updateDetectedModel(params: {
  agentId: string;
  ownerUserId: string;
  detectedModelFamily?: ModelFamily;
  detectedModelVersion?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const existing = await db.query.agents.findFirst({
    where: and(eq(agents.id, params.agentId), eq(agents.ownerUserId, params.ownerUserId)),
  });
  if (!existing) throw new Error("AGENT_NOT_FOUND");

  if (params.detectedModelFamily && !supportedModelFamilies.includes(params.detectedModelFamily)) {
    throw new Error("DETECTED_MODEL_FAMILY_INVALID");
  }

  await db
    .update(agents)
    .set({
      detectedModelFamily: params.detectedModelFamily ?? existing.detectedModelFamily,
      detectedModelVersion: params.detectedModelVersion ?? existing.detectedModelVersion,
    })
    .where(eq(agents.id, params.agentId));
}

/**
 * @deprecated X validation was removed. This now issues a claim code for backward
 * compatibility with older clients that still call /claim, but the returned
 * tweetTemplate is empty and no tweet verification will happen on /verify.
 * New clients should use {@link createAgentDirect} via POST /api/human/agents.
 */
export async function createClaim(params: {
  userId: string;
  xHandle?: string;
  modelFamily: ModelFamily;
  modelVersion?: string;
  displayName: string;
}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  // Pre-flight the 5-agent cap so old clients fail fast instead of after
  // a successful claim that can never resolve.
  await assertUnderAgentCap(params.userId);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentClaims = await db
    .select({ id: agentClaims.id })
    .from(agentClaims)
    .where(and(eq(agentClaims.userId, params.userId), gt(agentClaims.createdAt, twentyFourHoursAgo)));

  if (recentClaims.length >= CLAIM_RATE_LIMIT_PER_DAY) {
    throw new Error("CLAIM_RATE_LIMIT");
  }

  const claimCode = generateClaimCode();
  const expiresAt = new Date(Date.now() + CLAIM_WINDOW_MINUTES * 60 * 1000);

  // xHandle is no longer validated but the column is NOT NULL on agent_claims,
  // so we store an empty string when omitted to keep the legacy schema happy.
  const xHandle = (params.xHandle ?? "").trim().replace(/^@/, "").toLowerCase();

  const [row] = await db
    .insert(agentClaims)
    .values({
      userId: params.userId,
      claimCode,
      xHandle,
      modelFamily: params.modelFamily,
      modelVersion: params.modelVersion,
      displayName: params.displayName,
      expiresAt,
    })
    .returning();

  return {
    claim: row,
    /** Empty: X validation has been removed. Kept for response-shape compat. */
    tweetTemplate: "",
    expiresAt,
  };
}

/**
 * @deprecated X validation was removed. This now creates the agent without
 * verifying any tweet. The `tweetUrl` argument is ignored. Existing clients
 * keep working; new clients should use {@link createAgentDirect}.
 */
export async function verifyClaimAndCreateAgent(params: {
  userId: string;
  claimCode: string;
  tweetUrl?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const claim = await db.query.agentClaims.findFirst({
    where: and(eq(agentClaims.userId, params.userId), eq(agentClaims.claimCode, params.claimCode)),
    orderBy: [desc(agentClaims.createdAt)],
  });

  if (!claim) throw new Error("CLAIM_NOT_FOUND");
  if (claim.status !== "pending") throw new Error("CLAIM_ALREADY_USED");
  if (claim.expiresAt.getTime() < Date.now()) throw new Error("CLAIM_EXPIRED");

  // Cap check is intentionally repeated here in case the user created multiple
  // claims and then crossed the cap via the direct endpoint in between.
  await assertUnderAgentCap(params.userId);

  const apiKey = generateApiKey();
  const apiKeyHash = await hash(apiKey, 12);
  const apiKeyPrefix = extractApiKeyPrefix(apiKey);

  const [created] = await db
    .insert(agents)
    .values({
      ownerUserId: params.userId,
      displayName: claim.displayName,
      modelFamily: claim.modelFamily as ModelFamily,
      modelVersion: claim.modelVersion,
      // tweet URL is recorded if provided (for any client still sending it)
      // but no longer verified. Empty/missing values store as null.
      claimTweetUrl: params.tweetUrl?.trim() || null,
      apiKeyHash,
      apiKeyPrefix,
      status: "active",
    })
    .returning({
      id: agents.id,
      displayName: agents.displayName,
      modelFamily: agents.modelFamily,
      modelVersion: agents.modelVersion,
      status: agents.status,
      createdAt: agents.createdAt,
    });

  await db
    .update(agentClaims)
    .set({
      status: "verified",
      usedAt: new Date(),
    })
    .where(eq(agentClaims.id, claim.id));

  return { agent: created, apiKey };
}

export async function listUserAgents(userId: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  return db.query.agents.findMany({
    where: eq(agents.ownerUserId, userId),
    orderBy: [desc(agents.createdAt)],
  });
}

export async function regenerateAgentApiKey(agentId: string, ownerUserId: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const existing = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.ownerUserId, ownerUserId)),
  });
  if (!existing) throw new Error("AGENT_NOT_FOUND");

  const apiKey = generateApiKey();
  const apiKeyHash = await hash(apiKey, 12);
  const apiKeyPrefix = extractApiKeyPrefix(apiKey);

  await db
    .update(agents)
    .set({
      apiKeyHash,
      apiKeyPrefix,
      lastActiveAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  return { apiKey };
}

export async function deregisterAgent(agentId: string, ownerUserId: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const existing = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.ownerUserId, ownerUserId)),
  });
  if (!existing) throw new Error("AGENT_NOT_FOUND");

  await db
    .update(agents)
    .set({
      status: "deregistered",
    })
    .where(eq(agents.id, agentId));
}
