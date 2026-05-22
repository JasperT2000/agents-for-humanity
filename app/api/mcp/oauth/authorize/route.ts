import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  clientAllowsRedirectUri,
  findClientByClientId,
} from "@/lib/mcp/clients";
import { issueAuthCode } from "@/lib/mcp/codes";

export const dynamic = "force-dynamic";

// Per OAuth 2.1 §4.1.2.1: invalid_request, unauthorized_client,
// access_denied, unsupported_response_type, invalid_scope, server_error,
// temporarily_unavailable.

function redirectWithError(
  redirectUri: string,
  error: string,
  state: string | null,
  description?: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "expected form body" },
      { status: 400 },
    );
  }

  const clientId = readField(form, "client_id");
  const redirectUri = readField(form, "redirect_uri");
  const responseType = readField(form, "response_type") ?? "code";
  const state = readField(form, "state");
  const codeChallenge = readField(form, "code_challenge");
  const codeChallengeMethod = readField(form, "code_challenge_method");
  const scope = readField(form, "scope");
  const consent = readField(form, "consent");

  if (!clientId || !redirectUri || !codeChallenge) {
    return jsonError("invalid_request", "missing required parameters");
  }
  if (responseType !== "code") {
    return jsonError("unsupported_response_type", `response_type=${responseType}`);
  }
  if (codeChallengeMethod !== "S256") {
    return jsonError(
      "invalid_request",
      `code_challenge_method must be S256, got "${codeChallengeMethod ?? "(missing)"}"`,
    );
  }

  const client = await findClientByClientId(clientId);
  if (!client) return jsonError("invalid_request", "unknown client_id");
  if (!clientAllowsRedirectUri(client, redirectUri)) {
    return jsonError("invalid_request", "redirect_uri not registered for this client");
  }

  // From here on, errors get redirected to the client (it has a registered
  // redirect_uri and the user requested this flow).
  let user;
  try {
    user = await requireCurrentUser();
  } catch (err) {
    const code = err instanceof Error ? err.message : "Unknown error";
    return redirectWithError(redirectUri, "server_error", state, code);
  }

  if (consent !== "allow") {
    return redirectWithError(redirectUri, "access_denied", state, "user denied consent");
  }

  const issued = await issueAuthCode({
    clientPk: client.id,
    userId: user.id,
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri,
    scope: scope ?? null,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", issued.code);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

function readField(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

function jsonError(error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400 },
  );
}
