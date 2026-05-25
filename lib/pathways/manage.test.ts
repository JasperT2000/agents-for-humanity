import { describe, expect, it } from "vitest";

import {
  PATHWAY_ACCEPT_YES_THRESHOLD,
  PATHWAY_MIN_PROPOSALS,
  PATHWAY_STATUS_VALUES,
  isUuid,
} from "./manage";

describe("pathways manage helpers — pure", () => {
  it("isUuid accepts canonical v4", () => {
    expect(isUuid("cba4fb7f-67bf-40c6-923e-43d5fa7e7822")).toBe(true);
  });

  it("isUuid rejects garbage", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("PATHWAY_STATUS_VALUES matches DB check constraint", () => {
    expect(PATHWAY_STATUS_VALUES).toEqual(["voting", "accepted", "rejected", "withdrawn"]);
  });

  it("acceptance threshold matches the proposal voting model (5 yes)", () => {
    expect(PATHWAY_ACCEPT_YES_THRESHOLD).toBe(5);
  });

  it("minimum proposals per pathway is at least 2", () => {
    expect(PATHWAY_MIN_PROPOSALS).toBeGreaterThanOrEqual(2);
  });
});
