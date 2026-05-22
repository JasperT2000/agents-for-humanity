import { NextResponse } from "next/server";

import { findClientByClientId } from "@/lib/mcp/clients";
import { consumeAuthCode } from "@/lib/mcp/codes";
import { consumeRefreshToken, issueGrant } from "@/lib/mcp/grants";
import { verifyPkceS256 } from "@/lib/mcp/tokens";

export const dynamic = "force-dynamic";

/**
 * RFC 6749 §3.2 / OAuth 2.1: token endpoint.
 * Two grants supported: authorization_code (with mandatory PKCE) and
 * refresh_token. Public clients only — no client_secret authentication.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      form = await request.formData();
    } else if (contentType.includes("application/json")) {
      const json = (await request.json()) as Record<string, unknown>;
      form = new FormData();
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === "string") form.append(k, v);
      }
    } else {
      return errorResponse("invalid_request", "unsupported content-type", 400);
    }
  } catch {
    return errorResponse("invalid_request", "could not parse request body", 400);
  }

  const grantType = readField(form, "grant_type");
  if (grantType === "authorization_code") {
    return handleAuthorizationCode(form);
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(form);
  }
  return errorResponse("unsupported_grant_type", `grant_type=${grantType}`, 400);
}

async function handleAuthorizationCode(form: FormData) {
  const code = readField(form, "code");
  const redirectUri = readField(form, "redirect_uri");
  const clientId = readField(form, "client_id");
  const codeVerifier = readField(form, "code_verifier");

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return errorResponse("invalid_request", "missing required field", 400);
  }

  const client = await findClientByClientId(clientId);
  if (!client) return errorResponse("invalid_client", "unknown client_id", 401);

  const consumed = await consumeAuthCode({ code, clientPk: client.id });
  if (!consumed) return errorResponse("invalid_grant", "code invalid or expired", 400);

  if (consumed.redirectUri !== redirectUri) {
    return errorResponse("invalid_grant", "redirect_uri mismatch", 400);
  }
  if (!verifyPkceS256(codeVerifier, consumed.codeChallenge)) {
    return errorResponse("invalid_grant", "PKCE verification failed", 400);
  }

  const grant = await issueGrant({
    clientPk: client.id,
    userId: consumed.userId,
    scope: consumed.scope,
  });

  return tokenResponse(grant);
}

async function handleRefreshToken(form: FormData) {
  const refreshToken = readField(form, "refresh_token");
  const clientId = readField(form, "client_id");

  if (!refreshToken || !clientId) {
    return errorResponse("invalid_request", "missing required field", 400);
  }

  const client = await findClientByClientId(clientId);
  if (!client) return errorResponse("invalid_client", "unknown client_id", 401);

  const old = await consumeRefreshToken({ refreshToken, clientPk: client.id });
  if (!old) return errorResponse("invalid_grant", "refresh token invalid or expired", 400);

  const fresh = await issueGrant({
    clientPk: client.id,
    userId: old.userId,
    scope: old.scope,
    rotatedFromGrantId: old.grantId,
  });

  return tokenResponse(fresh);
}

type Grant = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
};

function tokenResponse(grant: Grant) {
  const expiresIn = Math.max(
    1,
    Math.floor((grant.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
  );
  return NextResponse.json(
    {
      access_token: grant.accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: grant.refreshToken,
    },
    {
      status: 200,
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    },
  );
}

function readField(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

function errorResponse(error: string, description: string, status: number) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "cache-control": "no-store" } },
  );
}
