import { describe, expect, it } from "vitest";

import {
  computeProposalEvidenceStrength,
  countVerdicts,
  findingStatusFromVerdicts,
  rollUpFindingStatus,
  type FindingVerdictStatus,
} from "./rollup";

describe("countVerdicts", () => {
  it("tallies each verdict kind", () => {
    expect(countVerdicts(["confirmed", "confirmed", "weak", "refuted"])).toEqual({
      confirmed: 2,
      weak: 1,
      refuted: 1,
    });
  });

  it("returns zeros for no verdicts", () => {
    expect(countVerdicts([])).toEqual({ confirmed: 0, weak: 0, refuted: 0 });
  });
});

describe("rollUpFindingStatus", () => {
  it("is unverified with no verdicts", () => {
    expect(rollUpFindingStatus({ confirmed: 0, weak: 0, refuted: 0 })).toBe("unverified");
  });

  it("confirms on a clear confirmation majority", () => {
    expect(rollUpFindingStatus({ confirmed: 2, weak: 1, refuted: 0 })).toBe("confirmed");
    expect(rollUpFindingStatus({ confirmed: 1, weak: 0, refuted: 0 })).toBe("confirmed");
  });

  it("marks weak when only weak verdicts exist", () => {
    expect(rollUpFindingStatus({ confirmed: 0, weak: 2, refuted: 0 })).toBe("weak");
  });

  it("refutes when refutations meet or beat confirmations (refuted wins ties)", () => {
    expect(rollUpFindingStatus({ confirmed: 0, weak: 0, refuted: 1 })).toBe("refuted");
    expect(rollUpFindingStatus({ confirmed: 1, weak: 0, refuted: 1 })).toBe("refuted");
    expect(rollUpFindingStatus({ confirmed: 0, weak: 1, refuted: 1 })).toBe("refuted");
  });

  it("is contested on a mix with no clear winner", () => {
    expect(rollUpFindingStatus({ confirmed: 1, weak: 2, refuted: 0 })).toBe("contested");
  });
});

describe("findingStatusFromVerdicts", () => {
  it("composes counting + roll-up", () => {
    expect(findingStatusFromVerdicts(["confirmed", "confirmed"])).toBe("confirmed");
    expect(findingStatusFromVerdicts(["refuted"])).toBe("refuted");
    expect(findingStatusFromVerdicts([])).toBe("unverified");
  });
});

describe("computeProposalEvidenceStrength", () => {
  it("is unbacked when nothing is cited", () => {
    const r = computeProposalEvidenceStrength([]);
    expect(r.label).toBe("unbacked");
    expect(r.confirmedRate).toBe(0);
    expect(r.citedTotal).toBe(0);
  });

  it("is strong at or above the two-thirds confirmed threshold", () => {
    const statuses: FindingVerdictStatus[] = ["confirmed", "confirmed", "weak"];
    const r = computeProposalEvidenceStrength(statuses);
    expect(r.confirmedCount).toBe(2);
    expect(r.citedTotal).toBe(3);
    expect(r.label).toBe("strong");
  });

  it("is partial below the strong threshold", () => {
    const r = computeProposalEvidenceStrength(["confirmed", "unverified", "unverified"]);
    expect(r.label).toBe("partial");
    expect(r.confirmedCount).toBe(1);
  });

  it("is unverified when cited findings carry no verdicts", () => {
    const r = computeProposalEvidenceStrength(["unverified", "unverified"]);
    expect(r.label).toBe("unverified");
    expect(r.confirmedCount).toBe(0);
  });

  it("refuted dominates even when some findings are confirmed", () => {
    const r = computeProposalEvidenceStrength(["confirmed", "confirmed", "refuted"]);
    expect(r.hasRefuted).toBe(true);
    expect(r.label).toBe("refuted");
  });

  it("does not count contested findings toward the confirmed rate", () => {
    const r = computeProposalEvidenceStrength(["contested", "contested"]);
    expect(r.confirmedCount).toBe(0);
    expect(r.confirmedRate).toBe(0);
    expect(r.label).toBe("unverified");
  });
});
