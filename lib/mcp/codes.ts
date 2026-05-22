import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpOauthCodes } from "@/db/schema";

import {
  AUTH_CODE_TTL_SECONDS,
  hashToken,
  newAuthCode,
  verifyToken,
} from "./tokens";

export type IssuedCode = {
  /** Plaintext code, returned to the client once and never stored. */
  code: string;
  expiresAt: Date;
};

export async function issueAuthCode(params: {
  clientPk: string;
  userId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  redirectUri: string;
  scope: string | null;
}): Promise<IssuedCode> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  if (params.codeChallengeMethod !== "S256") throw new Error("PKCE_METHOD_UNSUPPORTED");

  const code = newAuthCode();
  const codeHash = await hashToken(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);

  await db.insert(mcpOauthCodes).values({
    codeHash,
    clientPk: params.clientPk,
    userId: params.userId,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    redirectUri: params.redirectUri,
    scope: params.scope,
    expiresAt,
  });

  return { code, expiresAt };
}

export type ConsumedCode = {
  id: string;
  clientPk: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  scope: string | null;
};

/**
 * Looks up an auth code (by trying the bcrypt-hash comparison against unconsumed
 * rows for the given client) and marks it consumed atomically. Returns the
 * row's fields if and only if the code was valid, unexpired, and unconsumed.
 *
 * NOTE: bcrypt's design forces an N-row scan per attempt. In practice the set
 * is tiny because (a) we filter by clientPk, (b) codes expire in 10 minutes,
 * (c) the hot path is one code per OAuth flow. If this becomes a hotspot,
 * switch to HMAC-based hashing keyed by a server secret.
 */
export async function consumeAuthCode(params: {
  code: string;
  clientPk: string;
}): Promise<ConsumedCode | null> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const candidates = await db.query.mcpOauthCodes.findMany({
    where: and(
      eq(mcpOauthCodes.clientPk, params.clientPk),
      isNull(mcpOauthCodes.consumedAt),
    ),
    columns: {
      id: true,
      codeHash: true,
      clientPk: true,
      userId: true,
      codeChallenge: true,
      redirectUri: true,
      scope: true,
      expiresAt: true,
    },
  });

  for (const row of candidates) {
    if (row.expiresAt.getTime() < Date.now()) continue;
    if (await verifyToken(params.code, row.codeHash)) {
      const update = await db
        .update(mcpOauthCodes)
        .set({ consumedAt: new Date() })
        .where(and(eq(mcpOauthCodes.id, row.id), isNull(mcpOauthCodes.consumedAt)))
        .returning({ id: mcpOauthCodes.id });
      if (update.length === 0) return null; // raced — someone else consumed it first

      return {
        id: row.id,
        clientPk: row.clientPk,
        userId: row.userId,
        codeChallenge: row.codeChallenge,
        redirectUri: row.redirectUri,
        scope: row.scope,
      };
    }
  }

  return null;
}
