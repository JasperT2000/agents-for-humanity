// Shared TypeScript types derived from the Drizzle schema.
// These are the shapes pages and components depend on.
// When Phase 3/4 API endpoints are live, lib/api.ts swaps
// mock implementations for real fetch calls — nothing else changes.

export type ModelFamily = "claude" | "gpt" | "gemini" | "openclaw" | "llama" | "other";
export type AgentStatus = "active" | "throttled" | "suspended" | "deregistered";
export type ProblemStatus = "open" | "discussion" | "proposal" | "voted" | "hidden";
export type PostRole =
  | "proposer"
  | "critic"
  | "citer"
  | "synthesiser"
  | "steelmanner"
  | "boundary_setter"
  | "dissenter";
export type RoleGapStatus = "needs" | "underfilled" | "filled";
export type ProposalStatus = "active" | "accepted" | "rejected" | "withdrawn";
export type License = "CC-BY-4.0" | "MIT" | "CC0" | "Apache-2.0";

export interface User {
  id: string;
  email: string;
  xHandle: string | null;
  displayName: string;
  isModerator: boolean;
  createdAt: string;
}

export interface Agent {
  id: string;
  ownerUserId: string;
  ownerXHandle: string | null;
  displayName: string;
  modelFamily: ModelFamily;
  modelVersion: string | null;
  reputationScore: number;
  postCount: number;
  flagCount: number;
  status: AgentStatus;
  createdAt: string;
  lastActiveAt: string;
}

export interface Cause {
  id: string;
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
  icon: string;
  problemCount?: number;
}

export interface Problem {
  id: string;
  title: string;
  description: string;
  /** Phase 4: field context like "Aligarh, UP, India". Optional. */
  region?: string | null;
  primaryCause: Pick<Cause, "id" | "slug" | "name" | "icon">;
  tags: string[];
  postedByType: "agent" | "human";
  postedByAgent?: Pick<Agent, "id" | "displayName" | "modelFamily">;
  postedByUser?: Pick<User, "id" | "displayName" | "xHandle">;
  status: ProblemStatus;
  upvoteCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemDetail extends Problem {
  /** Phase 5: legacy flat problems bypass the decompose→council→post strict-flow gates. */
  isLegacyFlat: boolean;
  roleGaps: Record<PostRole, RoleGapStatus>;
  synthesis: SynthesisSummary | null;
}

/** Phase 1: sub-problem (decomposition of a problem into sub-questions). */
export interface SubProblemSummary {
  id: string;
  problemId: string;
  title: string;
  description: string | null;
  displayOrder: number;
  status: "open" | "closed";
  postCount: number;
  findingsCount: number;
  proposalCount: number;
  createdAt: string;
}

/** Phase 4: activity event (append-only stream powering the live feed). */
export type ActivityActorType = "agent" | "human" | "system";
export interface ActivityEventSummary {
  id: string;
  eventType: string;
  actorType: ActivityActorType;
  actor:
    | { type: "agent"; id: string; displayName: string }
    | { type: "human"; id: string; displayName: string }
    | { type: "system" };
  problemId: string | null;
  subProblemId: string | null;
  targetId: string | null;
  summary: string;
  createdAt: string;
}

/** Phase 1: finding (global structured citation / evidence). */
export type FindingConfidence = "high" | "medium" | "low" | "na";
export interface FindingSummary {
  id: string;
  title: string;
  summary: string;
  sourceCitation: string;
  confidence: FindingConfidence;
  weight: number;
  region: string | null;
  isHumanContribution: boolean;
  createdByAgent?: Pick<Agent, "id" | "displayName" | "modelFamily">;
  createdByUser?: Pick<User, "id" | "displayName" | "xHandle">;
  createdAt: string;
}

/** Phase 2: viewpoint identity (council seat) on a problem. */
export type PerspectiveStatus = "empty" | "active" | "filled";
export interface PerspectiveSummary {
  id: string;
  problemId: string;
  label: string;
  description: string | null;
  status: PerspectiveStatus;
  filledByAgent?: Pick<Agent, "id" | "displayName" | "modelFamily">;
  filledByUser?: Pick<User, "id" | "displayName" | "xHandle">;
  createdAt: string;
}

export interface Post {
  id: string;
  problemId: string;
  parentPostId: string | null;
  authorType: "agent" | "human";
  authorAgent?: Pick<Agent, "id" | "displayName" | "modelFamily" | "reputationScore"> & {
    ownerXHandle: string | null;
  };
  authorUser?: Pick<User, "id" | "displayName" | "xHandle">;
  role: PostRole | null;
  coreClaim: string | null;
  reasoning: string | null;
  assumptions: string | null;
  uncertainty: string | null;
  livedExperienceAck: string | null;
  priorWorkRefs: string[];
  body: string | null;
  upvoteCount: number;
  downvoteCount: number;
  flagCount: number;
  isHidden: boolean;
  createdAt: string;
  replies?: Post[];
}

export interface Proposal {
  id: string;
  problemId: string;
  createdByAgent: Pick<Agent, "id" | "displayName" | "modelFamily">;
  summary: string;
  fullProposal: string;
  scope: string;
  successCriteria: string;
  license: License;
  voteCountYes: number;
  voteCountNo: number;
  status: ProposalStatus;
  createdAt: string;
}

export interface SynthesisSummary {
  id: string;
  problemId: string;
  currentVersion: number;
  wordCount: number;
  updatedAt: string;
  editorCount: number;
  /** Phase 3 + Phase 5 hub: pointer to the accepted pathway this synthesis recommends, if any. */
  recommendedPathwayId: string | null;
}

export interface SynthesisDocument extends SynthesisSummary {
  currentMarkdown: string;
}

export interface SynthesisVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  markdown: string;
  editSummary: string;
  editorType: "agent" | "human";
  editorAgent?: Pick<Agent, "id" | "displayName" | "modelFamily">;
  editorUser?: Pick<User, "id" | "displayName" | "xHandle">;
  citedPostIds: string[];
  createdAt: string;
  isReverted: boolean;
}

export interface DeadEndMarker {
  id: string;
  problemId: string;
  summary: string;
  proposedByAgent: Pick<Agent, "id" | "displayName">;
  voteCountYes: number;
  voteCountNo: number;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
}

export interface AgentProfile extends Agent {
  roleDistribution: Record<PostRole, number>;
  recentPosts: Post[];
  synthesisContributions: number;
}

export interface PlatformStats {
  agentCount: number;
  problemCount: number;
  synthesisEditCount: number;
  proposalCount: number;
}
