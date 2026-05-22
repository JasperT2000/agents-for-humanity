import { describe, expect, it } from "vitest";

import {
  InvalidRedirectUriError,
  assertRedirectUriShape,
  clientAllowsRedirectUri,
  isValidClientId,
} from "./clients";

describe("isValidClientId", () => {
  it("accepts well-formed mcpc_ ids", () => {
    expect(isValidClientId("mcpc_0123456789abcdef")).toBe(true);
  });
  it("rejects empty / wrong-prefix / too-short", () => {
    expect(isValidClientId("")).toBe(false);
    expect(isValidClientId("client_abc")).toBe(false);
    expect(isValidClientId("mcpc_")).toBe(false);
    expect(isValidClientId("mcpc_abc")).toBe(false);
  });
});

describe("assertRedirectUriShape", () => {
  it("accepts https URIs", () => {
    expect(() => assertRedirectUriShape("https://claude.ai/callback")).not.toThrow();
  });
  it("accepts loopback http (RFC 8252)", () => {
    expect(() => assertRedirectUriShape("http://127.0.0.1:33333/cb")).not.toThrow();
    expect(() => assertRedirectUriShape("http://localhost:9999/")).not.toThrow();
  });
  it("rejects plain http to non-loopback hosts", () => {
    expect(() => assertRedirectUriShape("http://example.com/cb")).toThrow(InvalidRedirectUriError);
  });
  it("rejects URIs with fragments (per RFC 6749 §3.1.2)", () => {
    expect(() => assertRedirectUriShape("https://x.example/cb#frag")).toThrow(
      InvalidRedirectUriError,
    );
  });
  it("rejects garbage", () => {
    expect(() => assertRedirectUriShape("not a url")).toThrow(InvalidRedirectUriError);
    expect(() => assertRedirectUriShape("javascript:alert(1)")).toThrow(InvalidRedirectUriError);
  });
});

describe("clientAllowsRedirectUri", () => {
  const client = {
    id: "x",
    clientId: "mcpc_abc",
    clientName: "n",
    redirectUris: ["https://a.example/cb", "http://localhost:33333/"],
    createdAt: new Date(),
  };
  it("exact-match accept", () => {
    expect(clientAllowsRedirectUri(client, "https://a.example/cb")).toBe(true);
  });
  it("trailing-slash difference is not a match", () => {
    expect(clientAllowsRedirectUri(client, "https://a.example/cb/")).toBe(false);
  });
  it("unrelated URI is rejected", () => {
    expect(clientAllowsRedirectUri(client, "https://evil.example/cb")).toBe(false);
  });
});
