import { describe, expect, it } from "vitest";

import { computeRecommendedNextAction } from "./get-tick-context";

const baseProblem = {
  isLegacyFlat: false,
  subProblemsLength: 0,
  perspectivesCount: 0,
  emptyPerspectivesCount: 0,
  activeAgentHoldsPerspective: false,
  findingsCount: 0,
  activeProposalsLength: 0,
  acceptedProposalsCount: 0,
  pathwayCounts: { voting: 0, accepted: 0 },
  synthesisRecommendsPathway: false,
};

describe("computeRecommendedNextAction — strict-flow state machine", () => {
  it("legacy-flat problems always recommend `post`", () => {
    const r = computeRecommendedNextAction({ ...baseProblem, isLegacyFlat: true });
    expect(r.action).toBe("post");
  });

  it("undecomposed strict problem → `decompose`", () => {
    const r = computeRecommendedNextAction({ ...baseProblem, subProblemsLength: 0 });
    expect(r.action).toBe("decompose");
    expect(r.hint).toMatch(/create_sub_problem/);
  });

  it("decomposed but no perspectives → `form_council`", () => {
    const r = computeRecommendedNextAction({ ...baseProblem, subProblemsLength: 3 });
    expect(r.action).toBe("form_council");
    expect(r.hint).toMatch(/create_perspective/);
  });

  it("perspectives exist, agent holds none, seats open → `claim_perspective`", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 6,
      emptyPerspectivesCount: 5,
      activeAgentHoldsPerspective: false,
    });
    expect(r.action).toBe("claim_perspective");
  });

  it("perspectives exist, agent already holds one → moves on to research if no findings", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 6,
      emptyPerspectivesCount: 5,
      activeAgentHoldsPerspective: true,
    });
    expect(r.action).toBe("research");
  });

  it("council formed but no findings → `research`", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 4,
      emptyPerspectivesCount: 0,
      activeAgentHoldsPerspective: true,
      findingsCount: 0,
    });
    expect(r.action).toBe("research");
  });

  it("≥2 accepted proposals with no pathway yet → `propose_pathway`", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 4,
      emptyPerspectivesCount: 0,
      activeAgentHoldsPerspective: true,
      findingsCount: 5,
      acceptedProposalsCount: 2,
    });
    expect(r.action).toBe("propose_pathway");
  });

  it("accepted pathway exists but synthesis does not recommend it → `synthesise`", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 4,
      activeAgentHoldsPerspective: true,
      findingsCount: 5,
      acceptedProposalsCount: 3,
      pathwayCounts: { voting: 0, accepted: 1 },
      synthesisRecommendsPathway: false,
    });
    expect(r.action).toBe("synthesise");
  });

  it("active proposals exist after research stage → `vote`", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 4,
      activeAgentHoldsPerspective: true,
      findingsCount: 5,
      activeProposalsLength: 2,
      acceptedProposalsCount: 0,
    });
    expect(r.action).toBe("vote");
  });

  it("research done, no active proposals, nothing else → `propose`", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 4,
      activeAgentHoldsPerspective: true,
      findingsCount: 5,
    });
    expect(r.action).toBe("propose");
  });

  it("legacy-flat takes precedence over every other state", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      isLegacyFlat: true,
      subProblemsLength: 0,
      findingsCount: 0,
      acceptedProposalsCount: 5,
    });
    expect(r.action).toBe("post");
  });
});
