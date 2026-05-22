import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpOauthGrants } from "@/db/schema";

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  hashToken,
  newAccessToken,
  newRefreshToken,
  verifyToken,
} from "./tokens";

export type IssuedGrant = {
  grantId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
};

export async function issueGrant(params: {
  clientPk: string;
  userId: string;
  scope: string | null;
  rotatedFromGrantId?: string | null;
}): Promise<IssuedGrant> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const accessToken = newAccessToken();
  const refreshToken = newRefreshToken();
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshTokenExpiresAt = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const [accessTokenHash, refreshTokenHash] = await Promise.all([
    hashToken(accessToken),
    hashToken(refreshToken),
  ]);

  const [row] = await db
    .insert(mcpOauthGrants)
    .values({
      clientPk: params.clientPk,
      userId: params.userId,
      accessTokenHash,
      refreshTokenHash,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      scope: params.scope,
      rotatedFromGrantId: params.rotatedFromGrantId ?? null,
    })
    .returning({ id: mcpOauthGrants.id });

  return {
    grantId: row.id,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  };
}

export type ActiveGrant = {
  grantId: string;
  userId: string;
  clientPk: string;
  scope: string | null;
};

/**
 * Resolves an access token to its active grant. Returns null for any token that
 * is unrecognised, expired, or revoked. Updates last_used_at on success.
 *
 * Same bcrypt-scan caveat as consumeAuthCode — fine at current volumes.
 */
export async function resolveAccessToken(token: string): Promise<ActiveGrant | null> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const rows = await db.query.mcpOauthGrants.findMany({
    where: isNull(mcpOauthGrants.revokedAt),
    columns: {
      id: true,
      userId: true,
      clientPk: true,
      scope: true,
      accessTokenHash: true,
      accessTokenExpiresAt: true,
    },
  });

  for (const row of rows) {
    if (row.accessTokenExpiresAt.getTime() < Date.now()) continue;
    if (await verifyToken(token, row.accessTokenHash)) {
      await db
        .update(mcpOauthGrants)
        .set({ lastUsedAt: new Date() })
        .where(eq(mcpOauthGrants.id, row.id));
      return {
        grantId: row.id,
        userId: row.userId,
        clientPk: row.clientPk,
        scope: row.scope,
      };
    }
  }

  return null;
}

export type RefreshableGrant = {
  grantId: string;
  userId: string;
  clientPk: string;
  scope: string | null;
};

/**
 * Refresh-token rotation: validate, then revoke the old grant before the caller
 * issues a new one. Rejects expired or already-revoked tokens (re-use detection
 * is intentional — if a token is presented after rotation, the new chain
 * should also be revoked, but v1 keeps that simple).
 */
export async function consumeRefreshToken(params: {
  refreshToken: string;
  clientPk: string;
}): Promise<RefreshableGrant | null> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const rows = await db.query.mcpOauthGrants.findMany({
    where: and(
      eq(mcpOauthGrants.clientPk, params.clientPk),
      isNull(mcpOauthGrants.revokedAt),
    ),
    columns: {
      id: true,
      userId: true,
      clientPk: true,
      scope: true,
      refreshTokenHash: true,
      refreshTokenExpiresAt: true,
    },
  });

  for (const row of rows) {
    if (row.refreshTokenExpiresAt.getTime() < Date.now()) continue;
    if (await verifyToken(params.refreshToken, row.refreshTokenHash)) {
      const update = await db
        .update(mcpOauthGrants)
        .set({ revokedAt: new Date() })
        .where(and(eq(mcpOauthGrants.id, row.id), isNull(mcpOauthGrants.revokedAt)))
        .returning({ id: mcpOauthGrants.id });
      if (update.length === 0) return null; // raced

      return {
        grantId: row.id,
        userId: row.userId,
        clientPk: row.clientPk,
        scope: row.scope,
      };
    }
  }

  return null;
}

export async function revokeAllGrantsForToken(params: {
  token: string;
  isRefreshToken: boolean;
}): Promise<{ revoked: boolean }> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const rows = await db.query.mcpOauthGrants.findMany({
    where: isNull(mcpOauthGrants.revokedAt),
    columns: {
      id: true,
      accessTokenHash: true,
      refreshTokenHash: true,
    },
  });

  for (const row of rows) {
    const candidateHash = params.isRefreshToken ? row.refreshTokenHash : row.accessTokenHash;
    if (await verifyToken(params.token, candidateHash)) {
      await db
        .update(mcpOauthGrants)
        .set({ revokedAt: new Date() })
        .where(eq(mcpOauthGrants.id, row.id));
      return { revoked: true };
    }
  }
  return { revoked: false };
}
