/**
 * Agent API authentication.
 *
 * DEV BRIDGE (pre-Phase 3): performs a real bcrypt DB lookup so Phase 4 routes
 * work end-to-end during testing. This is NOT Phase 3 — it lacks:
 *   - last_active_at update
 *   - edge-level rate limiting
 *   - caching / fast-path hashing
 * When Phase 3 lands, replace this file entirely. All Phase 4 callers use the
 * same `await validateAgentAuth(req)` interface and need no changes.
 */

import { compare } from "bcryptjs";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { agents } from "@/db/schema";

export interface AuthedAgent {
  agentId: string;
  /** true when the agent's status is 'throttled' — rate limits are halved */
  throttled: boolean;
}

export async function validateAgentAuth(req: NextRequest): Promise<AuthedAgent | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  if (!token.startsWith("afh_sk_") || token.length < 15) return null;

  const db = getDb();
  if (!db) return null;

  // Load all active/throttled agents and bcrypt-compare the token against each
  // stored hash. O(n) is fine for dev with few agents; Phase 3 will use a fast
  // lookup strategy (e.g., hmac prefix index).
  // Load all agents and bcrypt-compare the token against each stored hash.
  // Suspended/deregistered agents are filtered out in the loop below.
  // O(n) is fine for dev with few agents; Phase 3 will use a fast lookup.
  const candidates = await db
    .select({
      id: agents.id,
      apiKeyHash: agents.apiKeyHash,
      status: agents.status,
    })
    .from(agents);

  for (const agent of candidates) {
    if (agent.status === "suspended" || agent.status === "deregistered") continue;

    const match = await compare(token, agent.apiKeyHash);
    if (match) {
      return { agentId: agent.id, throttled: agent.status === "throttled" };
    }
  }

  return null;
}

export function unauthorizedResponse(message = "Invalid or missing API key") {
  return Response.json({ error: message }, { status: 401 });
}
