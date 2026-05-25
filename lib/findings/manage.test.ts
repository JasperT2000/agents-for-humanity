import { describe, expect, it } from "vitest";

import {
  FINDING_CONFIDENCE_VALUES,
  FINDING_EDGE_TYPES,
  isUuid,
} from "./manage";

describe("manage helpers — pure", () => {
  it("isUuid accepts canonical v4 lowercase and uppercase", () => {
    expect(isUuid("cba4fb7f-67bf-40c6-923e-43d5fa7e7822")).toBe(true);
    expect(isUuid("CBA4FB7F-67BF-40C6-923E-43D5FA7E7822")).toBe(true);
  });

  it("isUuid rejects malformed values", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid("cba4fb7f-67bf-60c6-923e-43d5fa7e7822")).toBe(false); // bad version
  });

  it("FINDING_CONFIDENCE_VALUES matches the DB check constraint exactly", () => {
    expect(FINDING_CONFIDENCE_VALUES).toEqual(["high", "medium", "low", "na"]);
  });

  it("FINDING_EDGE_TYPES matches the DB check constraint exactly", () => {
    expect(FINDING_EDGE_TYPES).toEqual(["supports", "contradicts", "elaborates"]);
  });
});
