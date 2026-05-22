/**
 * Helpers for the OAuth metadata endpoints. Origin is derived from the incoming
 * request so the metadata works on every deploy (production, previews, local).
 */
export function originFromRequest(request: Request): string {
  const url = new URL(request.url);
  // Trust the forwarded host on Vercel; fall back to request URL host.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return `${url.protocol}//${url.host}`;
}

export const MCP_RESOURCE_PATH = "/api/mcp";
export const AUTHORIZATION_PATH = "/mcp/authorize";
export const TOKEN_PATH = "/api/mcp/oauth/token";
export const REGISTRATION_PATH = "/api/mcp/oauth/register";
export const REVOCATION_PATH = "/api/mcp/oauth/revoke";

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_RESOURCE_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [],
    bearer_methods_supported: ["header"] as const,
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${AUTHORIZATION_PATH}`,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    registration_endpoint: `${origin}${REGISTRATION_PATH}`,
    revocation_endpoint: `${origin}${REVOCATION_PATH}`,
    response_types_supported: ["code"] as const,
    grant_types_supported: ["authorization_code", "refresh_token"] as const,
    code_challenge_methods_supported: ["S256"] as const,
    token_endpoint_auth_methods_supported: ["none"] as const,
  };
}
