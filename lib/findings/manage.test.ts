import { describe, expect, it } from "vitest";

import {
  DECOMPOSE_MAX_SUB_PROBLEMS,
  DECOMPOSE_MIN_SUB_PROBLEMS,
  FINDING_CONFIDENCE_VALUES,
  FINDING_EDGE_TYPES,
  decomposeProblem,
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
    expect(FINDING_CONFIDENCE_VALUES).toEqual(["high", "medium", "low", "n/a"]);
  });

  it("FINDING_EDGE_TYPES matches the DB check constraint exactly", () => {
    expect(FINDING_EDGE_TYPES).toEqual(["supports", "contradicts", "elaborates"]);
  });
});

// =============================================================================
// decomposeProblem — pure validation paths (no DB hit; gates return INVALID_INPUT
// before any DB query). The actual insertion path is exercised by live MCP smoke.
// =============================================================================

const VALID_PROBLEM_ID = "cba4fb7f-67bf-40c6-923e-43d5fa7e7822";
const VALID_AGENT_ID = "0a04d87e-df12-42ac-8305-f7d911f22ea4";

describe("decomposeProblem — input validation gates", () => {
  it("constants are sane (min 2, max 12)", () => {
    expect(DECOMPOSE_MIN_SUB_PROBLEMS).toBe(2);
    expect(DECOMPOSE_MAX_SUB_PROBLEMS).toBe(12);
  });

  it("rejects non-UUID problem id", async () => {
    const r = await decomposeProblem({
      problemId: "not-a-uuid",
      subProblems: [{ title: "valid one here" }, { title: "valid two here" }],
      createdByAgentId: VALID_AGENT_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
  });

  it("rejects non-array sub_problems", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      // @ts-expect-error — intentionally wrong type for runtime validation test
      subProblems: "not an array",
      createdByAgentId: VALID_AGENT_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
  });

  it("rejects fewer than 2 sub-problems", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      subProblems: [{ title: "only one here" }],
      createdByAgentId: VALID_AGENT_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
  });

  it("rejects more than 12 sub-problems", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      subProblems: Array.from({ length: 13 }, (_, i) => ({
        title: `sub-question number ${i}`,
      })),
      createdByAgentId: VALID_AGENT_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
    expect("error" in r && (r.detail ?? "")).toMatch(/at most 12/);
  });

  it("rejects too-short titles", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      subProblems: [{ title: "valid title here" }, { title: "abc" }],
      createdByAgentId: VALID_AGENT_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
    expect("error" in r && (r.detail ?? "")).toMatch(/sub_problems\[1\]\.title/);
  });

  it("rejects duplicate titles (case-insensitive)", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      subProblems: [
        { title: "How do banks clear payments" },
        { title: "how do BANKS clear payments" },
      ],
      createdByAgentId: VALID_AGENT_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
    expect("error" in r && (r.detail ?? "")).toMatch(/duplicate|distinct/i);
  });

  it("rejects when neither agent nor user is set", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      subProblems: [{ title: "valid one here" }, { title: "valid two here" }],
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
    expect("error" in r && (r.detail ?? "")).toMatch(/exactly one/);
  });

  it("rejects when BOTH agent and user are set", async () => {
    const r = await decomposeProblem({
      problemId: VALID_PROBLEM_ID,
      subProblems: [{ title: "valid one here" }, { title: "valid two here" }],
      createdByAgentId: VALID_AGENT_ID,
      createdByUserId: VALID_PROBLEM_ID,
    });
    expect("error" in r && r.error).toBe("INVALID_INPUT");
    expect("error" in r && (r.detail ?? "")).toMatch(/exactly one/);
  });
});
