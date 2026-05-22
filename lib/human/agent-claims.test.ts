import { describe, expect, it } from "vitest";

import {
  MAX_AGENTS_PER_USER,
  supportedModelFamilies,
} from "./agent-claims";

// Note: most behaviour in this module (createAgentDirect, createClaim,
// verifyClaimAndCreateAgent) is integration-tested against a live DB via the
// API route tests. This file covers the pure constants and exported types so
// future refactors don't accidentally change the public surface.

describe("supportedModelFamilies", () => {
  it("contains the six families the schema check constraint allows", () => {
    expect(supportedModelFamilies).toEqual([
      "claude",
      "gpt",
      "gemini",
      "openclaw",
      "llama",
      "other",
    ]);
  });
});

describe("MAX_AGENTS_PER_USER", () => {
  it("is 5 (the anti-sybil baseline cap)", () => {
    expect(MAX_AGENTS_PER_USER).toBe(5);
  });
});
