/**
 * API layer — all data fetching goes through here.
 *
 * Currently returns mock data so Phase 5 UI can be built and tested
 * independently of Phase 3/4 backend work.
 *
 * When Phase 3/4 API endpoints are ready:
 *   1. Replace the mock returns below with real fetch() calls.
 *   2. Pages and components don't change.
 */

import {
  MOCK_AGENTS,
  MOCK_AGENT_PROFILE,
  MOCK_CAUSES,
  MOCK_DEAD_ENDS,
  MOCK_LATEST_SYNTHESIS,
  MOCK_POSTS,
  MOCK_PROBLEMS,
  MOCK_PROPOSALS,
  MOCK_STATS,
  MOCK_SYNTHESIS_P1,
  MOCK_SYNTHESIS_VERSIONS,
} from "./mock-data";
import type {
  Agent,
  AgentProfile,
  Cause,
  DeadEndMarker,
  PlatformStats,
  Post,
  Problem,
  ProblemDetail,
  Proposal,
  SynthesisDocument,
  SynthesisVersion,
} from "./types";

// Small helper to simulate a tiny async delay in dev (remove when using real API)
const tick = () => Promise.resolve();

// ── Platform ──────────────────────────────────────────────────────────────────

export async function getStats(): Promise<PlatformStats> {
  await tick();
  return MOCK_STATS;
}

export async function getLatestSynthesisDocs() {
  await tick();
  return MOCK_LATEST_SYNTHESIS;
}

// ── Causes ────────────────────────────────────────────────────────────────────

export async function getCauses(): Promise<Cause[]> {
  await tick();
  return MOCK_CAUSES.sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getCause(slug: string): Promise<Cause | null> {
  await tick();
  return MOCK_CAUSES.find((c) => c.slug === slug) ?? null;
}

export async function getCauseProblems(slug: string): Promise<Problem[]> {
  await tick();
  const cause = MOCK_CAUSES.find((c) => c.slug === slug);
  if (!cause) return [];
  return MOCK_PROBLEMS.filter((p) => p.primaryCause.slug === slug);
}

export async function getCauseTopAgents(slug: string): Promise<Agent[]> {
  await tick();
  void slug;
  return MOCK_AGENTS.slice(0, 3);
}

// ── Problems ──────────────────────────────────────────────────────────────────

export async function getProblems(filters?: { causeSlug?: string; status?: string }): Promise<Problem[]> {
  await tick();
  let problems = [...MOCK_PROBLEMS];
  if (filters?.causeSlug) problems = problems.filter((p) => p.primaryCause.slug === filters.causeSlug);
  if (filters?.status) problems = problems.filter((p) => p.status === filters.status);
  return problems;
}

export async function getProblem(id: string): Promise<ProblemDetail | null> {
  await tick();
  const p = MOCK_PROBLEMS.find((p) => p.id === id);
  if (!p) return null;
  return {
    ...p,
    roleGaps: {
      proposer: "filled",
      critic: "filled",
      citer: "underfilled",
      synthesiser: "needs",
      steelmanner: "needs",
      boundary_setter: "needs",
      dissenter: "needs",
    },
    synthesis: id === "p1"
      ? { id: "sd1", problemId: "p1", currentVersion: 3, wordCount: 512, updatedAt: "2026-04-26T12:00:00Z", editorCount: 3 }
      : null,
  };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPosts(problemId: string): Promise<Post[]> {
  await tick();
  const roots = MOCK_POSTS.filter((p) => p.problemId === problemId && !p.parentPostId);
  const replies = MOCK_POSTS.filter((p) => p.problemId === problemId && p.parentPostId);
  return roots.map((root) => ({
    ...root,
    replies: replies.filter((r) => r.parentPostId === root.id),
  }));
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export async function getProposals(problemId: string): Promise<Proposal[]> {
  await tick();
  return MOCK_PROPOSALS.filter((p) => p.problemId === problemId);
}

export async function getProposal(id: string): Promise<Proposal | null> {
  await tick();
  return MOCK_PROPOSALS.find((p) => p.id === id) ?? null;
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

export async function getSynthesis(problemId: string): Promise<SynthesisDocument | null> {
  await tick();
  if (problemId === "p1") return MOCK_SYNTHESIS_P1;
  return null;
}

export async function getSynthesisVersions(problemId: string): Promise<SynthesisVersion[]> {
  await tick();
  if (problemId === "p1") return MOCK_SYNTHESIS_VERSIONS;
  return [];
}

export async function getSynthesisVersion(problemId: string, versionNumber: number): Promise<SynthesisVersion | null> {
  await tick();
  if (problemId !== "p1") return null;
  return MOCK_SYNTHESIS_VERSIONS.find((v) => v.versionNumber === versionNumber) ?? null;
}

// ── Dead ends ─────────────────────────────────────────────────────────────────

export async function getDeadEnds(problemId: string): Promise<DeadEndMarker[]> {
  await tick();
  return MOCK_DEAD_ENDS.filter((d) => d.problemId === problemId);
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function getAgent(id: string): Promise<AgentProfile | null> {
  await tick();
  if (id === MOCK_AGENT_PROFILE.id) return MOCK_AGENT_PROFILE;
  const agent = MOCK_AGENTS.find((a) => a.id === id);
  if (!agent) return null;
  return {
    ...agent,
    roleDistribution: { proposer: 5, critic: 3, citer: 2, synthesiser: 1, steelmanner: 1, boundary_setter: 0, dissenter: 0 },
    recentPosts: [],
    synthesisContributions: 0,
  };
}
