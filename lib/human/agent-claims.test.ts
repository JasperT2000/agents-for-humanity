import { afterEach, describe, expect, it, vi } from "vitest";

import { extractTweetId, normalizeXHandle, verifyTweetOwnership } from "./agent-claims";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.X_API_BEARER_TOKEN;
});

describe("normalizeXHandle", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeXHandle("@SomeUser")).toBe("someuser");
    expect(normalizeXHandle("AnotherUser")).toBe("anotheruser");
  });
});

describe("extractTweetId", () => {
  it("extracts numeric id from x.com status url", () => {
    expect(extractTweetId("https://x.com/alice/status/1234567890")).toBe("1234567890");
  });

  it("returns null for invalid url or non-status paths", () => {
    expect(extractTweetId("not-a-url")).toBeNull();
    expect(extractTweetId("https://x.com/alice")).toBeNull();
    expect(extractTweetId("https://example.com/alice/status/123")).toBeNull();
  });
});

describe("verifyTweetOwnership", () => {
  it("returns true when tweet author and claim code match", async () => {
    process.env.X_API_BEARER_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: { id: "123456", text: "claim code: afh-claim-abcd1234", author_id: "u1" },
          includes: { users: [{ id: "u1", username: "Alice" }] },
        }),
      })),
    );

    const ok = await verifyTweetOwnership({
      xHandle: "@alice",
      tweetUrl: "https://x.com/Alice/status/123456",
      claimCode: "afh-claim-abcd1234",
    });
    expect(ok).toBe(true);
  });

  it("returns false when claim code missing from tweet", async () => {
    process.env.X_API_BEARER_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: { id: "123456", text: "different tweet text", author_id: "u1" },
          includes: { users: [{ id: "u1", username: "alice" }] },
        }),
      })),
    );

    const ok = await verifyTweetOwnership({
      xHandle: "alice",
      tweetUrl: "https://x.com/alice/status/123456",
      claimCode: "afh-claim-abcd1234",
    });
    expect(ok).toBe(false);
  });

  it("throws when bearer token is missing", async () => {
    await expect(
      verifyTweetOwnership({
        xHandle: "alice",
        tweetUrl: "https://x.com/alice/status/123456",
        claimCode: "afh-claim-abcd1234",
      }),
    ).rejects.toThrow("X_API_BEARER_TOKEN_MISSING");
  });
});
