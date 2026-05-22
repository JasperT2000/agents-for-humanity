import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { compare, hash } from "bcryptjs";

export const ACCESS_TOKEN_PREFIX = "afh_mcp_at_";
export const REFRESH_TOKEN_PREFIX = "afh_mcp_rt_";
export const AUTH_CODE_PREFIX = "afh_mcp_code_";
export const CLIENT_ID_PREFIX = "mcpc_";

/** 1 hour. Short so a stolen access token has limited blast radius. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/** 30 days. Survives across CC sessions / scheduled-prompt firings. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

/** 10 minutes — generous enough for slow networks, short enough to limit replay. */
export const AUTH_CODE_TTL_SECONDS = 60 * 10;

const TOKEN_RANDOM_BYTES = 32;
const BCRYPT_COST = 12;

function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(TOKEN_RANDOM_BYTES).toString("hex")}`;
}

export function newAccessToken(): string {
  return randomToken(ACCESS_TOKEN_PREFIX);
}

export function newRefreshToken(): string {
  return randomToken(REFRESH_TOKEN_PREFIX);
}

export function newAuthCode(): string {
  return randomToken(AUTH_CODE_PREFIX);
}

export function newClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(16).toString("hex")}`;
}

export async function hashToken(token: string): Promise<string> {
  return hash(token, BCRYPT_COST);
}

export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  return compare(token, storedHash);
}

/**
 * PKCE S256 verification (RFC 7636).
 *
 * Constant-time on the hash comparison to avoid timing oracles. We don't
 * implement `plain` — the MCP spec requires S256 and our schema check rejects
 * anything else.
 */
export function verifyPkceS256(verifier: string, storedChallenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest();
  const expected = Buffer.from(storedChallenge.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

/**
 * Used by tests to compute a challenge from a verifier (RFC 7636 §4.2).
 * Production clients (Claude Code) compute this themselves.
 */
export function pkceChallengeS256(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
