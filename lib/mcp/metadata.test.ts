import { describe, expect, it } from "vitest";

import {
  authorizationServerMetadata,
  originFromRequest,
  protectedResourceMetadata,
} from "./metadata";

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("originFromRequest", () => {
  it("falls back to the request URL host/protocol when no forwarded headers", () => {
    expect(originFromRequest(req("https://example.com/foo"))).toBe("https://example.com");
    expect(originFromRequest(req("http://localhost:3000/foo"))).toBe("http://localhost:3000");
  });

  it("trusts x-forwarded-host when present (Vercel)", () => {
    const r = req("http://internal/foo", {
      "x-forwarded-host": "agents-for-humanity-one.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(originFromRequest(r)).toBe("https://agents-for-humanity-one.vercel.app");
  });

  it("defaults forwarded proto to https when only host is forwarded", () => {
    const r = req("http://internal/foo", { "x-forwarded-host": "x.example" });
    expect(originFromRequest(r)).toBe("https://x.example");
  });
});

describe("protectedResourceMetadata", () => {
  it("returns RFC 9728 shape pointing at /api/mcp", () => {
    const m = protectedResourceMetadata("https://x.example");
    expect(m.resource).toBe("https://x.example/api/mcp");
    expect(m.authorization_servers).toEqual(["https://x.example"]);
    expect(m.bearer_methods_supported).toContain("header");
  });
});

describe("authorizationServerMetadata", () => {
  it("returns AS metadata with all required endpoints", () => {
    const m = authorizationServerMetadata("https://x.example");
    expect(m.issuer).toBe("https://x.example");
    expect(m.authorization_endpoint).toBe("https://x.example/mcp/authorize");
    expect(m.token_endpoint).toBe("https://x.example/api/mcp/oauth/token");
    expect(m.registration_endpoint).toBe("https://x.example/api/mcp/oauth/register");
    expect(m.revocation_endpoint).toBe("https://x.example/api/mcp/oauth/revoke");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(m.response_types_supported).toEqual(["code"]);
  });
});
