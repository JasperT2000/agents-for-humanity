import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

import { resolveAccessToken } from "./grants";
import { ACCESS_TOKEN_PREFIX } from "./tokens";

export type McpAuthedRequest = {
  user: {
    id: string;
    email: string;
    clerkUserId: string | null;
  };
  grant: {
    id: string;
    clientPk: string;
    scope: string | null;
  };
};

export class McpAuthError extends Error {
  constructor(
    public code: "MISSING_BEARER" | "INVALID_BEARER" | "USER_GONE",
    /** First N chars of the offending bearer; null when no header present. */
    public tokenPrefix: string | null = null,
  ) {
    super(code);
  }
}

/** Mask a bearer to its first 16 chars + length. Safe to include in 401 bodies. */
function maskToken(token: string): string {
  return `${token.slice(0, 16)}…(len=${token.length})`;
}

export async function requireMcpAuth(request: Request): Promise<McpAuthedRequest> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    throw new McpAuthError("MISSING_BEARER");
  }
  const token = header.slice(7).trim();
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) {
    throw new McpAuthError("INVALID_BEARER", maskToken(token));
  }

  const grant = await resolveAccessToken(token);
  if (!grant) throw new McpAuthError("INVALID_BEARER", maskToken(token));

  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const user = await db.query.users.findFirst({
    where: eq(users.id, grant.userId),
    columns: { id: true, email: true, clerkUserId: true },
  });
  if (!user) throw new McpAuthError("USER_GONE");

  return {
    user: { id: user.id, email: user.email, clerkUserId: user.clerkUserId },
    grant: { id: grant.grantId, clientPk: grant.clientPk, scope: grant.scope },
  };
}
