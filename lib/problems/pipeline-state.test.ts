import { describe, expect, it } from "vitest";

import { computePipelineState, type PipelineInputs } from "./pipeline-state";

const baseline: PipelineInputs = {
  subProblemsCount: 0,
  perspectivesTotal: 0,
  perspectivesFilled: 0,
  findingsTotal: 0,
  proposalsActive: 0,
  proposalsAccepted: 0,
  pathwaysAccepted: 0,
  hasSynthesisContent: false,
  synthesisRecommendsPathway: false,
};

function statusByKey(state: ReturnType<typeof computePipelineState>) {
  return Object.fromEntries(state.stages.map((s) => [s.key, s.status]));
}

describe("computePipelineState — workflow ribbon derivation", () => {
  it("emits the 9 BRIEF stages in canonical order", () => {
    const state = computePipelineState(baseline);
    expect(state.stages.map((s) => s.key)).toEqual([
      "problem",
      "subProblems",
      "research",
      "proposals",
      "critique",
      "steelman",
      "verify",
      "synth",
      "convergence",
    ]);
  });

  it("empty canvas: PROBLEM done, SUB-PROBLEMS active, everything else pending", () => {
    const status = statusByKey(computePipelineState(baseline));
    expect(status.problem).toBe("done");
    expect(status.subProblems).toBe("active");
    expect(status.research).toBe("pending");
    expect(status.proposals).toBe("pending");
    expect(status.critique).toBe("pending");
    expect(status.synth).toBe("pending");
    expect(status.convergence).toBe("pending");
  });

  it("after decomposition: RESEARCH becomes active", () => {
    const status = statusByKey(computePipelineState({ ...baseline, subProblemsCount: 4 }));
    expect(status.subProblems).toBe("done");
    expect(status.research).toBe("active");
    expect(status.proposals).toBe("pending");
  });

  it("with findings: PROPOSALS becomes active", () => {
    const status = statusByKey(
      computePipelineState({ ...baseline, subProblemsCount: 4, findingsTotal: 6 }),
    );
    expect(status.research).toBe("done");
    expect(status.proposals).toBe("active");
  });

  it("with active proposals: CRITIQUE/STEELMAN/VERIFY become active", () => {
    const status = statusByKey(
      computePipelineState({
        ...baseline,
        subProblemsCount: 4,
        findingsTotal: 6,
        proposalsActive: 2,
      }),
    );
    expect(status.proposals).toBe("done");
    expect(status.critique).toBe("active");
    expect(status.steelman).toBe("active");
    expect(status.verify).toBe("active");
    expect(status.synth).toBe("pending");
  });

  it("with accepted proposals: review stages done, SYNTH becomes active", () => {
    const status = statusByKey(
      computePipelineState({
        ...baseline,
        subProblemsCount: 4,
        findingsTotal: 6,
        proposalsAccepted: 2,
      }),
    );
    expect(status.critique).toBe("done");
    expect(status.steelman).toBe("done");
    expect(status.verify).toBe("done");
    expect(status.synth).toBe("active");
    expect(status.convergence).toBe("active");
  });

  it("with accepted pathway: CONVERGENCE done", () => {
    const status = statusByKey(
      computePipelineState({
        ...baseline,
        subProblemsCount: 4,
        findingsTotal: 6,
        proposalsAccepted: 3,
        pathwaysAccepted: 1,
      }),
    );
    expect(status.convergence).toBe("done");
  });

  it("with synthesis recommending pathway: SYNTH done", () => {
    const status = statusByKey(
      computePipelineState({
        ...baseline,
        subProblemsCount: 4,
        findingsTotal: 6,
        proposalsAccepted: 2,
        hasSynthesisContent: true,
        synthesisRecommendsPathway: true,
      }),
    );
    expect(status.synth).toBe("done");
  });

  it("council side-band reflects perspective fill", () => {
    expect(computePipelineState({ ...baseline, perspectivesTotal: 6, perspectivesFilled: 2 }).council).toEqual({
      total: 6,
      filled: 2,
      label: "Council: 2 of 6 filled",
    });
    expect(computePipelineState(baseline).council.label).toBe("Council not yet formed");
  });

  it("Indonesia-like state (4 sub-problems, 6 perspectives, 4 findings, no proposals)", () => {
    const state = computePipelineState({
      subProblemsCount: 4,
      perspectivesTotal: 6,
      perspectivesFilled: 1,
      findingsTotal: 4,
      proposalsActive: 0,
      proposalsAccepted: 0,
      pathwaysAccepted: 0,
      hasSynthesisContent: false,
      synthesisRecommendsPathway: false,
    });
    const status = statusByKey(state);
    expect(status.problem).toBe("done");
    expect(status.subProblems).toBe("done");
    expect(status.research).toBe("done");
    expect(status.proposals).toBe("active"); // ← next thing the council needs to do
    expect(status.critique).toBe("pending");
    expect(state.council.label).toBe("Council: 1 of 6 filled");
  });
});
