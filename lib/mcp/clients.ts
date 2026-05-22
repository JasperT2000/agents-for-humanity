import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpOauthClients } from "@/db/schema";

import { CLIENT_ID_PREFIX, newClientId } from "./tokens";

const MAX_REDIRECT_URIS = 5;
const HTTPS_OR_LOOPBACK_HTTP = /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$))/;

export type McpClient = {
  id: string;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: Date;
};

export class InvalidRedirectUriError extends Error {
  constructor(public uri: string) {
    super(`INVALID_REDIRECT_URI`);
  }
}

/**
 * Per OAuth 2.1 §1.5 and RFC 8252: native clients must use loopback HTTP
 * (127.0.0.1 or localhost). Everyone else must use HTTPS. We reject everything
 * else, including http://example.com, which would be open to MITM.
 */
export function assertRedirectUriShape(uri: string): void {
  if (!HTTPS_OR_LOOPBACK_HTTP.test(uri)) {
    throw new InvalidRedirectUriError(uri);
  }
  try {
    // Catches malformed URIs (parser throws). Fragment is forbidden per RFC 6749 §3.1.2.
    const parsed = new URL(uri);
    if (parsed.hash) throw new InvalidRedirectUriError(uri);
  } catch {
    throw new InvalidRedirectUriError(uri);
  }
}

export function isValidClientId(value: string): boolean {
  return typeof value === "string" && value.startsWith(CLIENT_ID_PREFIX) && value.length > CLIENT_ID_PREFIX.length + 8;
}

export async function registerClient(params: {
  clientName: string;
  redirectUris: string[];
}): Promise<McpClient> {
  if (!params.clientName.trim()) throw new Error("CLIENT_NAME_REQUIRED");
  if (params.redirectUris.length === 0) throw new Error("REDIRECT_URIS_REQUIRED");
  if (params.redirectUris.length > MAX_REDIRECT_URIS) throw new Error("TOO_MANY_REDIRECT_URIS");
  for (const uri of params.redirectUris) assertRedirectUriShape(uri);

  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const clientId = newClientId();

  const [row] = await db
    .insert(mcpOauthClients)
    .values({
      clientId,
      clientName: params.clientName.trim().slice(0, 200),
      redirectUris: params.redirectUris,
    })
    .returning();

  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    createdAt: row.createdAt,
  };
}

export async function findClientByClientId(clientId: string): Promise<McpClient | null> {
  if (!isValidClientId(clientId)) return null;
  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const row = await db.query.mcpOauthClients.findFirst({
    where: eq(mcpOauthClients.clientId, clientId),
  });
  if (!row) return null;

  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    createdAt: row.createdAt,
  };
}

export function clientAllowsRedirectUri(client: McpClient, uri: string): boolean {
  return client.redirectUris.includes(uri);
}
