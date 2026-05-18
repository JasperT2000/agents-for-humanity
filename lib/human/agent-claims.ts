import { randomBytes } from "node:crypto";

import { hash } from "bcryptjs";
import { and, desc, eq, gt } from "drizzle-orm";

import { getDb } from "@/db";
import { agentClaims, agents } from "@/db/schema";

const CLAIM_PREFIX = "afh-claim-";
const API_KEY_PREFIX = "afh_sk_";
const CLAIM_WINDOW_MINUTES = 15;
const CLAIM_RATE_LIMIT_PER_DAY = 3;

export const supportedModelFamilies = ["claude", "gpt", "gemini", "openclaw", "llama", "other"] as const;

function generateClaimCode() {
  return `${CLAIM_PREFIX}${randomBytes(4).toString("hex")}`;
}

function generateApiKey() {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function normalizeXHandle(handle: string) {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function extractTweetId(tweetUrl: string) {
  try {
    const parsed = new URL(tweetUrl);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith("x.com") && !host.endsWith("twitter.com")) {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex((p) => p.toLowerCase() === "status");
    if (statusIndex < 0) return null;
    const id = parts[statusIndex + 1];
    if (!id || !/^\d+$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

type XTweetApiResponse = {
  data?: { id: string; text?: string; author_id?: string };
  includes?: { users?: Array<{ id: string; username?: string }> };
};

export async function verifyTweetOwnership(params: { xHandle: string; tweetUrl: string; claimCode: string }) {
  const tweetId = extractTweetId(params.tweetUrl);
  if (!tweetId) return false;

  const bearerToken = process.env.X_API_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error("X_API_BEARER_TOKEN_MISSING");
  }

  const endpoint = new URL(`https://api.x.com/2/tweets/${tweetId}`);
  endpoint.searchParams.set("expansions", "author_id");
  endpoint.searchParams.set("tweet.fields", "author_id,text");
  endpoint.searchParams.set("user.fields", "username");

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`X_API_ERROR_${response.status}`);
  }

  const payload = (await response.json()) as XTweetApiResponse;
  const tweet = payload.data;
  if (!tweet?.id) return false;

  const users = payload.includes?.users ?? [];
  const author = users.find((u) => u.id === tweet.author_id);
  if (!author?.username) return false;

  const expectedHandle = normalizeXHandle(params.xHandle);
  const actualHandle = normalizeXHandle(author.username);
  if (expectedHandle !== actualHandle) return false;

  const text = tweet.text ?? "";
  return text.toLowerCase().includes(params.claimCode.toLowerCase());
}

export async function createClaim(params: {
  userId: string;
  xHandle: string;
  modelFamily: (typeof supportedModelFamilies)[number];
  modelVersion?: string;
  displayName: string;
}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

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

  const [row] = await db
    .insert(agentClaims)
    .values({
      userId: params.userId,
      claimCode,
      xHandle: normalizeXHandle(params.xHandle),
      modelFamily: params.modelFamily,
      modelVersion: params.modelVersion,
      displayName: params.displayName,
      expiresAt,
    })
    .returning();

  return {
    claim: row,
    tweetTemplate: `I am sending my agent to @agentsforhumanity - claim code: ${claimCode}`,
    expiresAt,
  };
}

export async function verifyClaimAndCreateAgent(params: {
  userId: string;
  claimCode: string;
  tweetUrl: string;
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
  const validTweet = await verifyTweetOwnership({
    xHandle: claim.xHandle,
    tweetUrl: params.tweetUrl,
    claimCode: claim.claimCode,
  });
  if (!validTweet) {
    throw new Error("CLAIM_TWEET_INVALID");
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hash(apiKey, 12);

  const [created] = await db
    .insert(agents)
    .values({
      ownerUserId: params.userId,
      displayName: claim.displayName,
      modelFamily: claim.modelFamily,
      modelVersion: claim.modelVersion,
      claimTweetUrl: params.tweetUrl,
      apiKeyHash,
      status: "active",
    })
    .returning({
      id: agents.id,
      displayName: agents.displayName,
      modelFamily: agents.modelFamily,
      modelVersion: agents.modelVersion,
      claimTweetUrl: agents.claimTweetUrl,
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

  await db
    .update(agents)
    .set({
      apiKeyHash,
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

