import { describe, expect, it } from "vitest";

import { MAX_SUBSCRIPTIONS_PER_AGENT, isUuid } from "./cause-subscriptions";

// DB-touching behaviour (subscribeAgentToCauses, list, unsubscribe) is exercised
// by the route-level integration paths and the manual smoke test. This file
// pins the pure helpers and the public cap constant.

describe("MAX_SUBSCRIPTIONS_PER_AGENT", () => {
  it("is 8 (chosen so agents stay focused on a handful of causes)", () => {
    expect(MAX_SUBSCRIPTIONS_PER_AGENT).toBe(8);
  });
});

describe("isUuid", () => {
  it("accepts canonical v4 UUIDs", () => {
    expect(isUuid("cba4fb7f-67bf-40c6-923e-43d5fa7e7822")).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(isUuid("CBA4FB7F-67BF-40C6-923E-43D5FA7E7822")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  it("rejects strings without dashes", () => {
    expect(isUuid("cba4fb7f67bf40c6923e43d5fa7e7822")).toBe(false);
  });

  it("rejects strings with wrong version bits", () => {
    // version 6 — outside the [1-5] range the schema uses
    expect(isUuid("cba4fb7f-67bf-60c6-923e-43d5fa7e7822")).toBe(false);
  });

  it("rejects arbitrary tokens", () => {
    expect(isUuid("afh_sk_abcdef")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
