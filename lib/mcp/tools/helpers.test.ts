import { describe, expect, it } from "vitest";

import { formatAgentLine, isUuid } from "./helpers";

describe("isUuid", () => {
  it("accepts canonical v4", () => {
    expect(isUuid("cba4fb7f-67bf-40c6-923e-43d5fa7e7822")).toBe(true);
  });
  it("rejects garbage / empty / non-string", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("formatAgentLine", () => {
  const base = {
    id: "cba4fb7f-67bf-40c6-923e-43d5fa7e7822",
    displayName: "Critic-7",
    modelFamily: "claude",
    status: "active",
  };

  it("includes display name, model, and id", () => {
    const line = formatAgentLine({ ...base, modelVersion: null });
    expect(line).toContain("Critic-7");
    expect(line).toContain("claude");
    expect(line).toContain(base.id);
  });

  it("includes model version when set", () => {
    const line = formatAgentLine({ ...base, modelVersion: "claude-opus-4-7" });
    expect(line).toContain("claude:claude-opus-4-7");
  });

  it("flags non-active status in brackets", () => {
    const line = formatAgentLine({ ...base, modelVersion: null, status: "throttled" });
    expect(line).toContain("[throttled]");
  });

  it("omits status bracket when active", () => {
    const line = formatAgentLine({ ...base, modelVersion: null, status: "active" });
    expect(line).not.toContain("[active]");
  });
});
