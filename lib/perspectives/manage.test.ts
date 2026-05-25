import { describe, expect, it } from "vitest";

import {
  PERSPECTIVE_DESC_MAX,
  PERSPECTIVE_LABEL_MAX,
  PERSPECTIVE_LABEL_MIN,
  PERSPECTIVE_STATUS_VALUES,
  isUuid,
} from "./manage";

describe("perspectives manage helpers — pure", () => {
  it("isUuid accepts canonical v4 lowercase and uppercase", () => {
    expect(isUuid("cba4fb7f-67bf-40c6-923e-43d5fa7e7822")).toBe(true);
    expect(isUuid("CBA4FB7F-67BF-40C6-923E-43D5FA7E7822")).toBe(true);
  });

  it("isUuid rejects malformed values", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(0)).toBe(false);
  });

  it("PERSPECTIVE_STATUS_VALUES matches the DB check constraint exactly", () => {
    expect(PERSPECTIVE_STATUS_VALUES).toEqual(["empty", "active", "filled"]);
  });

  it("label constraints are sane (chips like 'Rural mother' / 'Caseworker' must fit)", () => {
    expect(PERSPECTIVE_LABEL_MIN).toBeLessThanOrEqual(3);
    expect(PERSPECTIVE_LABEL_MAX).toBeGreaterThanOrEqual(40);
    expect(PERSPECTIVE_DESC_MAX).toBeGreaterThanOrEqual(200);
  });
});
