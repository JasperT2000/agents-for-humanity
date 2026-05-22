import { describe, expect, it } from "vitest";

import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_PREFIX,
  AUTH_CODE_TTL_SECONDS,
  CLIENT_ID_PREFIX,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_SECONDS,
  newAccessToken,
  newAuthCode,
  newClientId,
  newRefreshToken,
  pkceChallengeS256,
  verifyPkceS256,
} from "./tokens";

describe("token TTL constants", () => {
  it("access token is 1 hour", () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
  });
  it("refresh token is 30 days", () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(60 * 60 * 24 * 30);
  });
  it("auth code is 10 minutes", () => {
    expect(AUTH_CODE_TTL_SECONDS).toBe(600);
  });
});

describe("token generation", () => {
  it("access tokens are prefixed and ~80 chars total", () => {
    const t = newAccessToken();
    expect(t.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
    // 11-char prefix + 64 hex chars = 75; allow some flex
    expect(t.length).toBeGreaterThan(70);
  });

  it("refresh tokens have their own prefix (so revoke/refresh can disambiguate)", () => {
    expect(newRefreshToken().startsWith(REFRESH_TOKEN_PREFIX)).toBe(true);
    expect(REFRESH_TOKEN_PREFIX).not.toBe(ACCESS_TOKEN_PREFIX);
  });

  it("auth codes carry their own prefix", () => {
    expect(newAuthCode().startsWith(AUTH_CODE_PREFIX)).toBe(true);
  });

  it("client ids carry their own prefix and are unique per call", () => {
    const a = newClientId();
    const b = newClientId();
    expect(a.startsWith(CLIENT_ID_PREFIX)).toBe(true);
    expect(b.startsWith(CLIENT_ID_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("two access tokens generated back to back are different", () => {
    expect(newAccessToken()).not.toBe(newAccessToken());
  });
});

describe("PKCE S256", () => {
  it("verifier hashed to challenge round-trips", () => {
    const verifier = "the-quick-brown-fox-jumped-over-the-lazy-dog-aaa";
    const challenge = pkceChallengeS256(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects mismatched verifier/challenge", () => {
    const verifier = "abc123abc123abc123abc123abc123abc123abc123";
    const challenge = pkceChallengeS256(verifier);
    expect(verifyPkceS256("a-different-verifier-with-enough-length-aa", challenge)).toBe(false);
  });

  it("rejects garbage challenges without throwing", () => {
    expect(verifyPkceS256("anything", "not-base64url!!!")).toBe(false);
    expect(verifyPkceS256("anything", "")).toBe(false);
  });

  it("RFC 7636 example: verifier 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' -> known challenge", () => {
    const challenge = pkceChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    // From RFC 7636 §4.6
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
