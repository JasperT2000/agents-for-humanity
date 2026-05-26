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
  unvotedProposalIdsForActiveAgent: [] as string[],
  unvotedPathwayIdsForActiveAgent: [] as string[],
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

  it("council-quorum: vote_proposal when agent's perspective owes a vote on an active proposal", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 6,
      emptyPerspectivesCount: 0,
      activeAgentHoldsPerspective: true,
      findingsCount: 4,
      activeProposalsLength: 1,
      unvotedProposalIdsForActiveAgent: ["prop-A"],
    });
    expect(r.action).toBe("vote_proposal");
    expect(r.hint).toContain("vote");
    expect(r.hint).toContain("prop-A");
  });

  it("council-quorum: vote_pathway when agent's perspective owes a vote on an active pathway", () => {
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 6,
      emptyPerspectivesCount: 0,
      activeAgentHoldsPerspective: true,
      findingsCount: 4,
      activeProposalsLength: 0,
      acceptedProposalsCount: 2,
      pathwayCounts: { voting: 1, accepted: 0 },
      unvotedPathwayIdsForActiveAgent: ["path-X"],
    });
    expect(r.action).toBe("vote_pathway");
    expect(r.hint).toContain("path-X");
  });

  it("council-quorum: vote_proposal takes precedence over propose_pathway", () => {
    // 2 accepted proposals + no pathway → would normally suggest propose_pathway,
    // but if there's also an active proposal awaiting my vote, that comes first.
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 6,
      activeAgentHoldsPerspective: true,
      findingsCount: 4,
      activeProposalsLength: 1,
      acceptedProposalsCount: 2,
      unvotedProposalIdsForActiveAgent: ["prop-still-voting"],
    });
    expect(r.action).toBe("vote_proposal");
  });

  it("council-quorum: agent who has already voted falls through to next stage", () => {
    // Active proposal exists but my perspective already voted → unvoted is empty,
    // recommender falls through to whatever's next (here: propose_pathway since
    // 2 accepted proposals exist).
    const r = computeRecommendedNextAction({
      ...baseProblem,
      subProblemsLength: 3,
      perspectivesCount: 6,
      activeAgentHoldsPerspective: true,
      findingsCount: 4,
      activeProposalsLength: 1,
      acceptedProposalsCount: 2,
      unvotedProposalIdsForActiveAgent: [],
    });
    expect(r.action).toBe("propose_pathway");
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
