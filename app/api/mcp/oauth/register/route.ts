import { NextResponse } from "next/server";

import { InvalidRedirectUriError, registerClient } from "@/lib/mcp/clients";

export const dynamic = "force-dynamic";

type DcrBody = {
  client_name?: unknown;
  redirect_uris?: unknown;
  // The following are accepted in DCR (RFC 7591) but we don't currently
  // honour them — we always treat clients as public, S256-only, code-flow.
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  scope?: unknown;
};

const STATUS_MAP: Record<string, number> = {
  INVALID_JSON: 400,
  CLIENT_NAME_REQUIRED: 400,
  REDIRECT_URIS_REQUIRED: 400,
  TOO_MANY_REDIRECT_URIS: 400,
  INVALID_REDIRECT_URI: 400,
  DATABASE_UNAVAILABLE: 503,
};

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("INVALID_JSON", "invalid_client_metadata");
  }

  const body = raw as DcrBody;
  const clientName = typeof body.client_name === "string" ? body.client_name : "";
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((v): v is string => typeof v === "string")
    : [];

  try {
    const client = await registerClient({ clientName, redirectUris });
    // RFC 7591 response shape, mirroring Claude Code's expectations.
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidRedirectUriError) {
      return jsonError("INVALID_REDIRECT_URI", "invalid_redirect_uri", error.uri);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError(message, errorCodeForMessage(message));
  }
}

function errorCodeForMessage(message: string): string {
  if (message === "CLIENT_NAME_REQUIRED" || message === "REDIRECT_URIS_REQUIRED") {
    return "invalid_client_metadata";
  }
  if (message === "TOO_MANY_REDIRECT_URIS") return "invalid_client_metadata";
  return "server_error";
}

function jsonError(messageOrCode: string, oauthCode: string, detail?: string) {
  const status = STATUS_MAP[messageOrCode] ?? 500;
  return NextResponse.json(
    {
      error: oauthCode,
      error_description: detail ? `${messageOrCode}: ${detail}` : messageOrCode,
    },
    { status },
  );
}
