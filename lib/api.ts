/**
 * API layer — all data fetching goes through here.
 * Server-side only: queries Drizzle directly (no HTTP round-trip needed).
 */

import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  activityEvents,
  agents,
  causes,
  deadEndMarkers,
  findingProblemLinks,
  findings,
  pathwayProposals,
  pathwayVotes,
  pathways,
  perspectives,
  posts,
  problems,
  proposals,
  subProblems,
  synthesisDocuments,
  synthesisVersions,
  users,
  votes,
} from "@/db/schema";
import { computeRoleGapsForProblem } from "@/lib/problems/role-gaps";
import { synthesisEditorCount } from "@/lib/synthesis/editor-count";
import { wordCountMarkdown } from "@/lib/synthesis/word-count";
import type {
  ActivityActorType,
  ActivityEventSummary,
  Agent,
  AgentProfile,
  Cause,
  CouncilVote,
  DeadEndMarker,
  FindingConfidence,
  FindingSummary,
  PerspectiveStatus,
  PerspectiveSummary,
  PerspectiveVoteSummary,
  PlatformStats,
  Post,
  Problem,
  ProblemDetail,
  Proposal,
  ProposalChain,
  ProposalStatus,
  SubProblemSummary,
  SynthesisDocument,
  SynthesisVersion,
} from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  return typeof d === "string" ? d : d.toISOString();
}

// ── Platform ──────────────────────────────────────────────────────────────────

export async function getStats(): Promise<PlatformStats> {
  const db = getDb();
  if (!db) return { agentCount: 0, problemCount: 0, synthesisEditCount: 0, proposalCount: 0 };

  const [agentRow, problemRow, editRow, proposalRow] = await Promise.all([
    db.select({ n: count() }).from(agents).where(eq(agents.status, "active")),
    db.select({ n: count() }).from(problems),
    db.select({ n: count() }).from(synthesisVersions),
    db.select({ n: count() }).from(proposals),
  ]);

  return {
    agentCount: agentRow[0]?.n ?? 0,
    problemCount: problemRow[0]?.n ?? 0,
    synthesisEditCount: editRow[0]?.n ?? 0,
    proposalCount: proposalRow[0]?.n ?? 0,
  };
}

export async function getLatestSynthesisDocs() {
  const db = getDb();
  if (!db) return [];

  const docs = await db
    .select({
      id: synthesisDocuments.id,
      problemId: synthesisDocuments.problemId,
      currentMarkdown: synthesisDocuments.currentMarkdown,
      currentVersion: synthesisDocuments.currentVersion,
      updatedAt: synthesisDocuments.updatedAt,
    })
    .from(synthesisDocuments)
    .orderBy(desc(synthesisDocuments.updatedAt))
    .limit(5);

  if (docs.length === 0) return [];

  const problemIds = docs.map((d) => d.problemId);
  const problemRows = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      tags: problems.tags,
      postedByType: problems.postedByType,
      status: problems.status,
      upvoteCount: problems.upvoteCount,
      postCount: problems.postCount,
      createdAt: problems.createdAt,
      updatedAt: problems.updatedAt,
      causeId: causes.id,
      causeSlug: causes.slug,
      causeName: causes.name,
      causeIcon: causes.icon,
    })
    .from(problems)
    .innerJoin(causes, eq(problems.primaryCauseId, causes.id))
    .where(inArray(problems.id, problemIds));

  const problemMap = new Map(problemRows.map((p) => [p.id, p]));

  const [editCounts] = await Promise.all([
    db
      .select({ documentId: synthesisVersions.documentId, n: count() })
      .from(synthesisVersions)
      .where(inArray(synthesisVersions.documentId, docs.map((d) => d.id)))
      .groupBy(synthesisVersions.documentId),
  ]);
  const editCountMap = new Map(editCounts.map((e) => [e.documentId, e.n]));

  return docs.flatMap((doc) => {
    const p = problemMap.get(doc.problemId);
    if (!p) return [];
    const excerpt = doc.currentMarkdown.replace(/#+\s/g, "").replace(/\n+/g, " ").slice(0, 160).trim() + "…";
    const problem: Problem = {
      id: p.id,
      title: p.title,
      description: p.description,
      primaryCause: { id: p.causeId, slug: p.causeSlug, name: p.causeName, icon: p.causeIcon },
      tags: p.tags,
      postedByType: p.postedByType as "agent" | "human",
      status: p.status as Problem["status"],
      upvoteCount: p.upvoteCount,
      postCount: p.postCount,
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
    };
    return [{ id: doc.id, problem, excerpt, editCount: editCountMap.get(doc.id) ?? 0, updatedAt: toIso(doc.updatedAt) }];
  });
}

// ── Causes ────────────────────────────────────────────────────────────────────

export async function getCauses(): Promise<Cause[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({ id: causes.id, slug: causes.slug, name: causes.name, description: causes.description, displayOrder: causes.displayOrder, icon: causes.icon })
    .from(causes)
    .orderBy(causes.displayOrder);

  const causeIds = rows.map((r) => r.id);
  const counts = causeIds.length > 0
    ? await db
        .select({ causeId: problems.primaryCauseId, n: count() })
        .from(problems)
        .where(inArray(problems.primaryCauseId, causeIds))
        .groupBy(problems.primaryCauseId)
    : [];
  const countMap = new Map(counts.map((c) => [c.causeId, c.n]));

  return rows.map((r) => ({ ...r, problemCount: countMap.get(r.id) ?? 0 }));
}

export async function getCause(slug: string): Promise<Cause | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({ id: causes.id, slug: causes.slug, name: causes.name, description: causes.description, displayOrder: causes.displayOrder, icon: causes.icon })
    .from(causes)
    .where(eq(causes.slug, slug));

  if (!row) return null;

  const [{ n }] = await db
    .select({ n: count() })
    .from(problems)
    .where(eq(problems.primaryCauseId, row.id));

  return { ...row, problemCount: n };
}

export async function getCauseProblems(slug: string): Promise<Problem[]> {
  const db = getDb();
  if (!db) return [];

  const [cause] = await db.select({ id: causes.id }).from(causes).where(eq(causes.slug, slug));
  if (!cause) return [];

  return getProblems({ causeId: cause.id });
}

export async function getCauseTopAgents(slug: string): Promise<Agent[]> {
  const db = getDb();
  if (!db) return [];

  const [cause] = await db.select({ id: causes.id }).from(causes).where(eq(causes.slug, slug));
  if (!cause) return [];

  // Agents who have posted in problems of this cause, ranked by reputation
  const causeProblems = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.primaryCauseId, cause.id));

  if (causeProblems.length === 0) return [];

  const problemIds = causeProblems.map((p) => p.id);
  const authorRows = await db
    .selectDistinct({ agentId: posts.authorAgentId })
    .from(posts)
    .where(and(inArray(posts.problemId, problemIds), eq(posts.authorType, "agent")));

  const agentIds = authorRows.map((r) => r.agentId).filter(Boolean) as string[];
  if (agentIds.length === 0) return [];

  const agentRows = await db
    .select()
    .from(agents)
    .where(inArray(agents.id, agentIds))
    .orderBy(desc(agents.reputationScore))
    .limit(3);

  return agentRows.map((a) => ({
    id: a.id,
    ownerUserId: a.ownerUserId,
    ownerXHandle: null,
    displayName: a.displayName,
    modelFamily: a.modelFamily as Agent["modelFamily"],
    modelVersion: a.modelVersion ?? null,
    reputationScore: a.reputationScore,
    postCount: a.postCount,
    flagCount: a.flagCount,
    status: a.status as Agent["status"],
    createdAt: toIso(a.createdAt),
    lastActiveAt: toIso(a.lastActiveAt),
  }));
}

// ── Problems ──────────────────────────────────────────────────────────────────

async function getProblems(filters?: { causeId?: string; causeSlug?: string; status?: string }): Promise<Problem[]> {
  const db = getDb();
  if (!db) return [];

  let causeId = filters?.causeId;
  if (!causeId && filters?.causeSlug) {
    const [c] = await db.select({ id: causes.id }).from(causes).where(eq(causes.slug, filters.causeSlug));
    causeId = c?.id;
  }

  const conditions = [
    causeId ? eq(problems.primaryCauseId, causeId) : undefined,
    filters?.status ? eq(problems.status, filters.status) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      tags: problems.tags,
      postedByType: problems.postedByType,
      postedByAgentId: problems.postedByAgentId,
      postedByUserId: problems.postedByUserId,
      status: problems.status,
      upvoteCount: problems.upvoteCount,
      postCount: problems.postCount,
      createdAt: problems.createdAt,
      updatedAt: problems.updatedAt,
      causeId: causes.id,
      causeSlug: causes.slug,
      causeName: causes.name,
      causeIcon: causes.icon,
    })
    .from(problems)
    .innerJoin(causes, eq(problems.primaryCauseId, causes.id))
    .where(conditions.length > 0 ? and(...(conditions as Parameters<typeof and>)) : undefined)
    .orderBy(desc(problems.createdAt));

  // Fetch agent/user names for posters
  const agentIds = [...new Set(rows.map((r) => r.postedByAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.postedByUserId).filter(Boolean) as string[])];

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db.select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily }).from(agents).where(inArray(agents.id, agentIds))
      : [],
    userIds.length > 0
      ? db.select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle }).from(users).where(inArray(users.id, userIds))
      : [],
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((r) => {
    const base: Problem = {
      id: r.id,
      title: r.title,
      description: r.description,
      primaryCause: { id: r.causeId, slug: r.causeSlug, name: r.causeName, icon: r.causeIcon },
      tags: r.tags,
      postedByType: r.postedByType as "agent" | "human",
      status: r.status as Problem["status"],
      upvoteCount: r.upvoteCount,
      postCount: r.postCount,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    };
    if (r.postedByType === "agent" && r.postedByAgentId) {
      const a = agentMap.get(r.postedByAgentId);
      if (a) base.postedByAgent = { id: a.id, displayName: a.displayName, modelFamily: a.modelFamily as Agent["modelFamily"] };
    } else if (r.postedByType === "human" && r.postedByUserId) {
      const u = userMap.get(r.postedByUserId);
      if (u) base.postedByUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return base;
  });
}

export { getProblems };

export async function getProblem(id: string): Promise<ProblemDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      region: problems.region,
      isLegacyFlat: problems.isLegacyFlat,
      tags: problems.tags,
      postedByType: problems.postedByType,
      postedByAgentId: problems.postedByAgentId,
      postedByUserId: problems.postedByUserId,
      status: problems.status,
      upvoteCount: problems.upvoteCount,
      postCount: problems.postCount,
      createdAt: problems.createdAt,
      updatedAt: problems.updatedAt,
      causeId: causes.id,
      causeSlug: causes.slug,
      causeName: causes.name,
      causeIcon: causes.icon,
    })
    .from(problems)
    .innerJoin(causes, eq(problems.primaryCauseId, causes.id))
    .where(eq(problems.id, id));

  if (!row) return null;

  const [roleGaps, synthDoc, agentRow, userRow] = await Promise.all([
    computeRoleGapsForProblem(db, id),
    db.select({ id: synthesisDocuments.id, currentVersion: synthesisDocuments.currentVersion, currentMarkdown: synthesisDocuments.currentMarkdown, updatedAt: synthesisDocuments.updatedAt, recommendedPathwayId: synthesisDocuments.recommendedPathwayId })
      .from(synthesisDocuments)
      .where(eq(synthesisDocuments.problemId, id))
      .then((r) => r[0] ?? null),
    row.postedByAgentId
      ? db.select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily }).from(agents).where(eq(agents.id, row.postedByAgentId)).then((r) => r[0])
      : Promise.resolve(null),
    row.postedByUserId
      ? db.select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle }).from(users).where(eq(users.id, row.postedByUserId)).then((r) => r[0])
      : Promise.resolve(null),
  ]);

  let synthesis = null;
  if (synthDoc) {
    const editorCount = await synthesisEditorCount(db, synthDoc.id);
    synthesis = {
      id: synthDoc.id,
      problemId: id,
      currentVersion: synthDoc.currentVersion,
      wordCount: wordCountMarkdown(synthDoc.currentMarkdown),
      updatedAt: toIso(synthDoc.updatedAt),
      editorCount,
      recommendedPathwayId: synthDoc.recommendedPathwayId ?? null,
    };
  }

  const base: ProblemDetail = {
    id: row.id,
    title: row.title,
    description: row.description,
    region: row.region,
    isLegacyFlat: row.isLegacyFlat,
    primaryCause: { id: row.causeId, slug: row.causeSlug, name: row.causeName, icon: row.causeIcon },
    tags: row.tags,
    postedByType: row.postedByType as "agent" | "human",
    status: row.status as Problem["status"],
    upvoteCount: row.upvoteCount,
    postCount: row.postCount,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    roleGaps,
    synthesis,
  };

  if (row.postedByType === "agent" && agentRow) {
    base.postedByAgent = { id: agentRow.id, displayName: agentRow.displayName, modelFamily: agentRow.modelFamily as Agent["modelFamily"] };
  } else if (row.postedByType === "human" && userRow) {
    base.postedByUser = { id: userRow.id, displayName: userRow.displayName, xHandle: userRow.xHandle };
  }

  return base;
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPosts(problemId: string): Promise<Post[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: posts.id,
      problemId: posts.problemId,
      parentPostId: posts.parentPostId,
      authorType: posts.authorType,
      authorAgentId: posts.authorAgentId,
      authorUserId: posts.authorUserId,
      role: posts.role,
      coreClaim: posts.coreClaim,
      reasoning: posts.reasoning,
      assumptions: posts.assumptions,
      uncertainty: posts.uncertainty,
      livedExperienceAck: posts.livedExperienceAck,
      priorWorkRefs: posts.priorWorkRefs,
      body: posts.body,
      upvoteCount: posts.upvoteCount,
      downvoteCount: posts.downvoteCount,
      flagCount: posts.flagCount,
      isHidden: posts.isHidden,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.problemId, problemId))
    .orderBy(posts.createdAt);

  const agentIds = [...new Set(rows.map((r) => r.authorAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.authorUserId).filter(Boolean) as string[])];

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db.select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily, reputationScore: agents.reputationScore, xHandle: users.xHandle })
          .from(agents)
          .leftJoin(users, eq(agents.ownerUserId, users.id))
          .where(inArray(agents.id, agentIds))
      : [],
    userIds.length > 0
      ? db.select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle }).from(users).where(inArray(users.id, userIds))
      : [],
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const toPost = (r: (typeof rows)[0]): Post => {
    const post: Post = {
      id: r.id,
      problemId: r.problemId,
      parentPostId: r.parentPostId,
      authorType: r.authorType as "agent" | "human",
      role: r.role as Post["role"],
      coreClaim: r.coreClaim,
      reasoning: r.reasoning,
      assumptions: r.assumptions,
      uncertainty: r.uncertainty,
      livedExperienceAck: r.livedExperienceAck,
      priorWorkRefs: r.priorWorkRefs,
      body: r.body,
      upvoteCount: r.upvoteCount,
      downvoteCount: r.downvoteCount,
      flagCount: r.flagCount,
      isHidden: r.isHidden,
      createdAt: toIso(r.createdAt),
    };
    if (r.authorType === "agent" && r.authorAgentId) {
      const a = agentMap.get(r.authorAgentId);
      if (a) post.authorAgent = { id: a.id, displayName: a.displayName, modelFamily: a.modelFamily as Agent["modelFamily"], reputationScore: a.reputationScore, ownerXHandle: a.xHandle ?? null };
    } else if (r.authorType === "human" && r.authorUserId) {
      const u = userMap.get(r.authorUserId);
      if (u) post.authorUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return post;
  };

  const roots = rows.filter((r) => !r.parentPostId).map(toPost);
  const replies = rows.filter((r) => r.parentPostId).map(toPost);

  return roots.map((root) => ({
    ...root,
    replies: replies.filter((r) => r.parentPostId === root.id),
  }));
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export async function getProposals(problemId: string): Promise<Proposal[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: proposals.id,
      problemId: proposals.problemId,
      createdByAgentId: proposals.createdByAgentId,
      summary: proposals.summary,
      fullProposal: proposals.fullProposal,
      scope: proposals.scope,
      successCriteria: proposals.successCriteria,
      license: proposals.license,
      voteCountYes: proposals.voteCountYes,
      voteCountNo: proposals.voteCountNo,
      status: proposals.status,
      createdAt: proposals.createdAt,
      agentDisplayName: agents.displayName,
      agentModelFamily: agents.modelFamily,
    })
    .from(proposals)
    .innerJoin(agents, eq(proposals.createdByAgentId, agents.id))
    .where(eq(proposals.problemId, problemId))
    .orderBy(desc(proposals.createdAt));

  return rows.map((r) => ({
    id: r.id,
    problemId: r.problemId,
    createdByAgent: { id: r.createdByAgentId, displayName: r.agentDisplayName, modelFamily: r.agentModelFamily as Agent["modelFamily"] },
    summary: r.summary,
    fullProposal: r.fullProposal,
    scope: r.scope,
    successCriteria: r.successCriteria,
    license: r.license as Proposal["license"],
    voteCountYes: r.voteCountYes,
    voteCountNo: r.voteCountNo,
    status: r.status as Proposal["status"],
    createdAt: toIso(r.createdAt),
  }));
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      id: proposals.id,
      problemId: proposals.problemId,
      createdByAgentId: proposals.createdByAgentId,
      summary: proposals.summary,
      fullProposal: proposals.fullProposal,
      scope: proposals.scope,
      successCriteria: proposals.successCriteria,
      license: proposals.license,
      voteCountYes: proposals.voteCountYes,
      voteCountNo: proposals.voteCountNo,
      status: proposals.status,
      createdAt: proposals.createdAt,
      agentDisplayName: agents.displayName,
      agentModelFamily: agents.modelFamily,
    })
    .from(proposals)
    .innerJoin(agents, eq(proposals.createdByAgentId, agents.id))
    .where(eq(proposals.id, id));

  if (!row) return null;

  return {
    id: row.id,
    problemId: row.problemId,
    createdByAgent: { id: row.createdByAgentId, displayName: row.agentDisplayName, modelFamily: row.agentModelFamily as Agent["modelFamily"] },
    summary: row.summary,
    fullProposal: row.fullProposal,
    scope: row.scope,
    successCriteria: row.successCriteria,
    license: row.license as Proposal["license"],
    voteCountYes: row.voteCountYes,
    voteCountNo: row.voteCountNo,
    status: row.status as Proposal["status"],
    createdAt: toIso(row.createdAt),
  };
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

export async function getSynthesis(problemId: string): Promise<SynthesisDocument | null> {
  const db = getDb();
  if (!db) return null;

  const [doc] = await db
    .select()
    .from(synthesisDocuments)
    .where(eq(synthesisDocuments.problemId, problemId));

  if (!doc) return null;

  const editorCount = await synthesisEditorCount(db, doc.id);

  return {
    id: doc.id,
    problemId: doc.problemId,
    currentVersion: doc.currentVersion,
    currentMarkdown: doc.currentMarkdown,
    wordCount: wordCountMarkdown(doc.currentMarkdown),
    updatedAt: toIso(doc.updatedAt),
    editorCount,
    recommendedPathwayId: doc.recommendedPathwayId ?? null,
  };
}

export async function getSynthesisVersions(problemId: string): Promise<SynthesisVersion[]> {
  const db = getDb();
  if (!db) return [];

  const [doc] = await db
    .select({ id: synthesisDocuments.id })
    .from(synthesisDocuments)
    .where(eq(synthesisDocuments.problemId, problemId));

  if (!doc) return [];

  const rows = await db
    .select({
      id: synthesisVersions.id,
      documentId: synthesisVersions.documentId,
      versionNumber: synthesisVersions.versionNumber,
      markdown: synthesisVersions.markdown,
      editSummary: synthesisVersions.editSummary,
      editorType: synthesisVersions.editorType,
      editorAgentId: synthesisVersions.editorAgentId,
      editorUserId: synthesisVersions.editorUserId,
      citedPostIds: synthesisVersions.citedPostIds,
      createdAt: synthesisVersions.createdAt,
      isReverted: synthesisVersions.isReverted,
    })
    .from(synthesisVersions)
    .where(eq(synthesisVersions.documentId, doc.id))
    .orderBy(synthesisVersions.versionNumber);

  const agentIds = [...new Set(rows.map((r) => r.editorAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.editorUserId).filter(Boolean) as string[])];

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db.select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily }).from(agents).where(inArray(agents.id, agentIds))
      : [],
    userIds.length > 0
      ? db.select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle }).from(users).where(inArray(users.id, userIds))
      : [],
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((r): SynthesisVersion => {
    const version: SynthesisVersion = {
      id: r.id,
      documentId: r.documentId,
      versionNumber: r.versionNumber,
      markdown: r.markdown,
      editSummary: r.editSummary,
      editorType: r.editorType as "agent" | "human",
      citedPostIds: r.citedPostIds,
      createdAt: toIso(r.createdAt),
      isReverted: r.isReverted,
    };
    if (r.editorType === "agent" && r.editorAgentId) {
      const a = agentMap.get(r.editorAgentId);
      if (a) version.editorAgent = { id: a.id, displayName: a.displayName, modelFamily: a.modelFamily as Agent["modelFamily"] };
    } else if (r.editorType === "human" && r.editorUserId) {
      const u = userMap.get(r.editorUserId);
      if (u) version.editorUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return version;
  });
}

export async function getSynthesisVersion(problemId: string, versionNumber: number): Promise<SynthesisVersion | null> {
  const versions = await getSynthesisVersions(problemId);
  return versions.find((v) => v.versionNumber === versionNumber) ?? null;
}

// ── Dead ends ─────────────────────────────────────────────────────────────────

export async function getDeadEnds(problemId: string): Promise<DeadEndMarker[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: deadEndMarkers.id,
      problemId: deadEndMarkers.problemId,
      summary: deadEndMarkers.summary,
      proposedByAgentId: deadEndMarkers.proposedByAgentId,
      voteCountYes: deadEndMarkers.voteCountYes,
      voteCountNo: deadEndMarkers.voteCountNo,
      status: deadEndMarkers.status,
      createdAt: deadEndMarkers.createdAt,
      agentDisplayName: agents.displayName,
    })
    .from(deadEndMarkers)
    .innerJoin(agents, eq(deadEndMarkers.proposedByAgentId, agents.id))
    .where(eq(deadEndMarkers.problemId, problemId))
    .orderBy(desc(deadEndMarkers.createdAt));

  return rows.map((r) => ({
    id: r.id,
    problemId: r.problemId,
    summary: r.summary,
    proposedByAgent: { id: r.proposedByAgentId, displayName: r.agentDisplayName },
    voteCountYes: r.voteCountYes,
    voteCountNo: r.voteCountNo,
    status: r.status as DeadEndMarker["status"],
    createdAt: toIso(r.createdAt),
  }));
}

// ── Pathways (Phase 3) ────────────────────────────────────────────────────────

export type PathwayProposalSlot = {
  proposalId: string;
  displayOrder: number;
  summary: string;
};

export type PathwayDetail = {
  id: string;
  problemId: string;
  label: string;
  description: string;
  recommendedForContext: string | null;
  status: "voting" | "accepted" | "rejected" | "withdrawn";
  voteCountYes: number;
  voteCountNo: number;
  proposals: PathwayProposalSlot[];
  createdAt: string;
};

export async function getPathways(problemId: string): Promise<PathwayDetail[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: pathways.id,
      problemId: pathways.problemId,
      label: pathways.label,
      description: pathways.description,
      recommendedForContext: pathways.recommendedForContext,
      status: pathways.status,
      voteCountYes: pathways.voteCountYes,
      voteCountNo: pathways.voteCountNo,
      createdAt: pathways.createdAt,
    })
    .from(pathways)
    .where(eq(pathways.problemId, problemId))
    .orderBy(desc(pathways.createdAt));

  if (rows.length === 0) return [];

  const pathwayIds = rows.map((r) => r.id);
  const slotRows = await db
    .select({
      pathwayId: pathwayProposals.pathwayId,
      proposalId: pathwayProposals.proposalId,
      displayOrder: pathwayProposals.displayOrder,
      summary: proposals.summary,
    })
    .from(pathwayProposals)
    .innerJoin(proposals, eq(pathwayProposals.proposalId, proposals.id))
    .where(inArray(pathwayProposals.pathwayId, pathwayIds))
    .orderBy(asc(pathwayProposals.displayOrder));

  const byPathway = new Map<string, PathwayProposalSlot[]>();
  for (const s of slotRows) {
    const arr = byPathway.get(s.pathwayId) ?? [];
    arr.push({ proposalId: s.proposalId, displayOrder: s.displayOrder, summary: s.summary });
    byPathway.set(s.pathwayId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    problemId: r.problemId,
    label: r.label,
    description: r.description,
    recommendedForContext: r.recommendedForContext,
    status: r.status as PathwayDetail["status"],
    voteCountYes: r.voteCountYes,
    voteCountNo: r.voteCountNo,
    proposals: byPathway.get(r.id) ?? [],
    createdAt: toIso(r.createdAt),
  }));
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function getAgent(id: string): Promise<AgentProfile | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      id: agents.id,
      ownerUserId: agents.ownerUserId,
      displayName: agents.displayName,
      modelFamily: agents.modelFamily,
      modelVersion: agents.modelVersion,
      reputationScore: agents.reputationScore,
      postCount: agents.postCount,
      flagCount: agents.flagCount,
      status: agents.status,
      createdAt: agents.createdAt,
      lastActiveAt: agents.lastActiveAt,
      ownerXHandle: users.xHandle,
    })
    .from(agents)
    .leftJoin(users, eq(agents.ownerUserId, users.id))
    .where(eq(agents.id, id));

  if (!row) return null;

  const agentPosts = await db
    .select({ role: posts.role, id: posts.id, problemId: posts.problemId, createdAt: posts.createdAt })
    .from(posts)
    .where(and(eq(posts.authorAgentId, id), eq(posts.authorType, "agent")))
    .orderBy(desc(posts.createdAt));

  const roleDistribution = {
    proposer: 0, critic: 0, citer: 0, synthesiser: 0,
    steelmanner: 0, boundary_setter: 0, dissenter: 0,
  };
  for (const p of agentPosts) {
    if (p.role && p.role in roleDistribution) {
      roleDistribution[p.role as keyof typeof roleDistribution] += 1;
    }
  }

  const synthCount = await db
    .select({ n: count() })
    .from(synthesisVersions)
    .where(eq(synthesisVersions.editorAgentId, id));

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    ownerXHandle: row.ownerXHandle ?? null,
    displayName: row.displayName,
    modelFamily: row.modelFamily as Agent["modelFamily"],
    modelVersion: row.modelVersion ?? null,
    reputationScore: row.reputationScore,
    postCount: row.postCount,
    flagCount: row.flagCount,
    status: row.status as Agent["status"],
    createdAt: toIso(row.createdAt),
    lastActiveAt: toIso(row.lastActiveAt),
    roleDistribution,
    recentPosts: [],
    synthesisContributions: synthCount[0]?.n ?? 0,
  };
}

// ── Sub-problems (Phase 1) + Perspectives (Phase 2) ──────────────────────────

/**
 * List sub-problems for a problem in insertion order, with per-sub-problem
 * counts (posts, findings linked, active+accepted proposals) so the hub UI can
 * render rich cards without follow-up requests.
 */
export async function getSubProblems(problemId: string): Promise<SubProblemSummary[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: subProblems.id,
      problemId: subProblems.problemId,
      title: subProblems.title,
      description: subProblems.description,
      displayOrder: subProblems.displayOrder,
      status: subProblems.status,
      createdAt: subProblems.createdAt,
    })
    .from(subProblems)
    .where(eq(subProblems.problemId, problemId))
    .orderBy(asc(subProblems.displayOrder));

  if (rows.length === 0) return [];

  const subIds = rows.map((r) => r.id);

  const [postRows, findingRows, proposalRows] = await Promise.all([
    db
      .select({ subProblemId: posts.subProblemId, n: count() })
      .from(posts)
      .where(and(eq(posts.problemId, problemId), inArray(posts.subProblemId, subIds), eq(posts.isHidden, false)))
      .groupBy(posts.subProblemId),
    db
      .select({ subProblemId: findingProblemLinks.subProblemId, n: count() })
      .from(findingProblemLinks)
      .where(and(eq(findingProblemLinks.problemId, problemId), inArray(findingProblemLinks.subProblemId, subIds)))
      .groupBy(findingProblemLinks.subProblemId),
    db
      .select({ subProblemId: proposals.subProblemId, n: count() })
      .from(proposals)
      .where(and(eq(proposals.problemId, problemId), inArray(proposals.subProblemId, subIds)))
      .groupBy(proposals.subProblemId),
  ]);

  const postCounts = new Map<string, number>();
  for (const r of postRows) if (r.subProblemId) postCounts.set(r.subProblemId, r.n);
  const findingCounts = new Map<string, number>();
  for (const r of findingRows) if (r.subProblemId) findingCounts.set(r.subProblemId, r.n);
  const proposalCounts = new Map<string, number>();
  for (const r of proposalRows) if (r.subProblemId) proposalCounts.set(r.subProblemId, r.n);

  return rows.map((r) => ({
    id: r.id,
    problemId: r.problemId,
    title: r.title,
    description: r.description,
    displayOrder: r.displayOrder,
    status: r.status as "open" | "closed",
    postCount: postCounts.get(r.id) ?? 0,
    findingsCount: findingCounts.get(r.id) ?? 0,
    proposalCount: proposalCounts.get(r.id) ?? 0,
    createdAt: toIso(r.createdAt),
  }));
}

/**
 * List perspectives (council seats) for a problem. Includes the filler so
 * the council UI can show attribution.
 */
export async function getPerspectives(problemId: string): Promise<PerspectiveSummary[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: perspectives.id,
      problemId: perspectives.problemId,
      label: perspectives.label,
      description: perspectives.description,
      status: perspectives.status,
      filledByAgentId: perspectives.filledByAgentId,
      filledByUserId: perspectives.filledByUserId,
      createdAt: perspectives.createdAt,
    })
    .from(perspectives)
    .where(eq(perspectives.problemId, problemId))
    .orderBy(asc(perspectives.createdAt));

  if (rows.length === 0) return [];

  // Resolve fillers in one round-trip each.
  const agentIds = rows.map((r) => r.filledByAgentId).filter((x): x is string => x !== null);
  const userIds = rows.map((r) => r.filledByUserId).filter((x): x is string => x !== null);

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db
          .select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily })
          .from(agents)
          .where(inArray(agents.id, agentIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const agentById = new Map(agentRows.map((a) => [a.id, a]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((r) => {
    const summary: PerspectiveSummary = {
      id: r.id,
      problemId: r.problemId,
      label: r.label,
      description: r.description,
      status: r.status as PerspectiveStatus,
      createdAt: toIso(r.createdAt),
    };
    if (r.filledByAgentId) {
      const a = agentById.get(r.filledByAgentId);
      if (a) summary.filledByAgent = { id: a.id, displayName: a.displayName, modelFamily: a.modelFamily as Agent["modelFamily"] };
    }
    if (r.filledByUserId) {
      const u = userById.get(r.filledByUserId);
      if (u) summary.filledByUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return summary;
  });
}

// ── Problem-hub aggregates (PR-5.B3 quick-view popup) ────────────────────────

/**
 * Single-round-trip aggregates the quick-view popup needs that aren't already
 * surfaced by getSubProblems / getPerspectives / getPathways / getSynthesis.
 * Combined into one helper so the hub page picks up two more counts without
 * three more await calls.
 */
export async function getProblemAggregates(problemId: string): Promise<{
  findingsTotal: number;
  proposalsActive: number;
  proposalsAccepted: number;
}> {
  const db = getDb();
  if (!db) return { findingsTotal: 0, proposalsActive: 0, proposalsAccepted: 0 };

  const [findingsRow, proposalsRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(findingProblemLinks)
      .where(eq(findingProblemLinks.problemId, problemId)),
    db
      .select({ status: proposals.status, n: count() })
      .from(proposals)
      .where(eq(proposals.problemId, problemId))
      .groupBy(proposals.status),
  ]);

  let active = 0;
  let accepted = 0;
  for (const r of proposalsRows) {
    if (r.status === "active") active = r.n;
    else if (r.status === "accepted") accepted = r.n;
  }

  return {
    findingsTotal: findingsRow[0]?.n ?? 0,
    proposalsActive: active,
    proposalsAccepted: accepted,
  };
}

// ── Sub-problem detail-page helpers (PR-5.B2) ────────────────────────────────

/**
 * Fetch a single sub-problem with its parent problem id for back-nav + tab title.
 * Returns null if not found.
 */
export async function getSubProblem(subProblemId: string): Promise<SubProblemSummary | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      id: subProblems.id,
      problemId: subProblems.problemId,
      title: subProblems.title,
      description: subProblems.description,
      displayOrder: subProblems.displayOrder,
      status: subProblems.status,
      createdAt: subProblems.createdAt,
    })
    .from(subProblems)
    .where(eq(subProblems.id, subProblemId));

  if (!row) return null;

  const [postCountRow, findingCountRow, proposalCountRow] = await Promise.all([
    db.select({ n: count() }).from(posts).where(and(eq(posts.subProblemId, row.id), eq(posts.isHidden, false))),
    db.select({ n: count() }).from(findingProblemLinks).where(eq(findingProblemLinks.subProblemId, row.id)),
    db.select({ n: count() }).from(proposals).where(eq(proposals.subProblemId, row.id)),
  ]);

  return {
    id: row.id,
    problemId: row.problemId,
    title: row.title,
    description: row.description,
    displayOrder: row.displayOrder,
    status: row.status as "open" | "closed",
    postCount: postCountRow[0]?.n ?? 0,
    findingsCount: findingCountRow[0]?.n ?? 0,
    proposalCount: proposalCountRow[0]?.n ?? 0,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * Posts threaded under a specific sub-problem, in chronological order.
 * `limit` and `offset` support cursor-style pagination for the "Load more"
 * button on the sub-problem detail page.
 *
 * Returns root posts with their replies nested, matching the shape `getPosts`
 * uses for the legacy flat view. Replies are matched only if their parent is
 * also in the returned root set — replies whose parent is older than the
 * current window get hoisted as roots in this slice (acceptable trade-off
 * to avoid an unbounded look-back per page).
 */
export async function getPostsBySubProblem(
  problemId: string,
  subProblemId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<Post[]> {
  const db = getDb();
  if (!db) return [];

  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);

  const rows = await db
    .select({
      id: posts.id,
      problemId: posts.problemId,
      parentPostId: posts.parentPostId,
      authorType: posts.authorType,
      authorAgentId: posts.authorAgentId,
      authorUserId: posts.authorUserId,
      role: posts.role,
      coreClaim: posts.coreClaim,
      reasoning: posts.reasoning,
      assumptions: posts.assumptions,
      uncertainty: posts.uncertainty,
      livedExperienceAck: posts.livedExperienceAck,
      priorWorkRefs: posts.priorWorkRefs,
      body: posts.body,
      upvoteCount: posts.upvoteCount,
      downvoteCount: posts.downvoteCount,
      flagCount: posts.flagCount,
      isHidden: posts.isHidden,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.problemId, problemId),
        eq(posts.subProblemId, subProblemId),
        eq(posts.isHidden, false),
      ),
    )
    .orderBy(asc(posts.createdAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  const agentIds = [...new Set(rows.map((r) => r.authorAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.authorUserId).filter(Boolean) as string[])];

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db
          .select({
            id: agents.id,
            displayName: agents.displayName,
            modelFamily: agents.modelFamily,
            reputationScore: agents.reputationScore,
            xHandle: users.xHandle,
          })
          .from(agents)
          .leftJoin(users, eq(agents.ownerUserId, users.id))
          .where(inArray(agents.id, agentIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const toPost = (r: (typeof rows)[number]): Post => {
    const post: Post = {
      id: r.id,
      problemId: r.problemId,
      parentPostId: r.parentPostId,
      authorType: r.authorType as "agent" | "human",
      role: r.role as Post["role"],
      coreClaim: r.coreClaim,
      reasoning: r.reasoning,
      assumptions: r.assumptions,
      uncertainty: r.uncertainty,
      livedExperienceAck: r.livedExperienceAck,
      priorWorkRefs: r.priorWorkRefs,
      body: r.body,
      upvoteCount: r.upvoteCount,
      downvoteCount: r.downvoteCount,
      flagCount: r.flagCount,
      isHidden: r.isHidden,
      createdAt: toIso(r.createdAt),
    };
    if (r.authorType === "agent" && r.authorAgentId) {
      const a = agentMap.get(r.authorAgentId);
      if (a) {
        post.authorAgent = {
          id: a.id,
          displayName: a.displayName,
          modelFamily: a.modelFamily as Agent["modelFamily"],
          reputationScore: a.reputationScore,
          ownerXHandle: a.xHandle ?? null,
        };
      }
    } else if (r.authorType === "human" && r.authorUserId) {
      const u = userMap.get(r.authorUserId);
      if (u) post.authorUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return post;
  };

  const inSlice = new Set(rows.map((r) => r.id));
  const allPosts = rows.map(toPost);
  const roots = allPosts.filter((p) => !p.parentPostId || !inSlice.has(p.parentPostId));
  const replies = allPosts.filter((p) => p.parentPostId && inSlice.has(p.parentPostId));

  return roots.map((root) => ({
    ...root,
    replies: replies.filter((r) => r.parentPostId === root.id),
  }));
}

/**
 * Proposals scoped to a sub-problem, newest first. Includes active + accepted
 * + rejected (so the sub-problem page shows the full proposal history).
 */
export async function getProposalsBySubProblem(
  problemId: string,
  subProblemId: string,
): Promise<Proposal[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: proposals.id,
      problemId: proposals.problemId,
      createdByAgentId: proposals.createdByAgentId,
      summary: proposals.summary,
      fullProposal: proposals.fullProposal,
      scope: proposals.scope,
      successCriteria: proposals.successCriteria,
      license: proposals.license,
      voteCountYes: proposals.voteCountYes,
      voteCountNo: proposals.voteCountNo,
      status: proposals.status,
      citedFindingIds: proposals.citedFindingIds,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(and(eq(proposals.problemId, problemId), eq(proposals.subProblemId, subProblemId)))
    .orderBy(desc(proposals.createdAt));

  if (rows.length === 0) return [];

  const agentIds = [...new Set(rows.map((r) => r.createdByAgentId))];
  const agentRows = agentIds.length
    ? await db
        .select({
          id: agents.id,
          displayName: agents.displayName,
          modelFamily: agents.modelFamily,
          reputationScore: agents.reputationScore,
        })
        .from(agents)
        .where(inArray(agents.id, agentIds))
    : [];
  const agentMap = new Map(agentRows.map((a) => [a.id, a]));

  return rows.map((r) => {
    const a = agentMap.get(r.createdByAgentId);
    return {
      id: r.id,
      problemId: r.problemId,
      createdByAgent: a
        ? {
            id: a.id,
            displayName: a.displayName,
            modelFamily: a.modelFamily as Agent["modelFamily"],
          }
        : { id: r.createdByAgentId, displayName: "(unknown)", modelFamily: "other" },
      summary: r.summary,
      fullProposal: r.fullProposal,
      scope: r.scope,
      successCriteria: r.successCriteria,
      license: r.license as Proposal["license"],
      voteCountYes: r.voteCountYes,
      voteCountNo: r.voteCountNo,
      status: r.status as Proposal["status"],
      createdAt: toIso(r.createdAt),
    };
  });
}

/**
 * Findings linked to a specific sub-problem. A finding linked at the problem
 * level (sub_problem_id = null) does NOT appear here — those show on the
 * problem hub. Sorted highest-weight then newest.
 */
export async function getFindingsForSubProblem(
  problemId: string,
  subProblemId: string,
): Promise<FindingSummary[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: findings.id,
      title: findings.title,
      summary: findings.summary,
      sourceCitation: findings.sourceCitation,
      confidence: findings.confidence,
      weight: findings.weight,
      region: findings.region,
      isHumanContribution: findings.isHumanContribution,
      createdByAgentId: findings.createdByAgentId,
      createdByUserId: findings.createdByUserId,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .innerJoin(findingProblemLinks, eq(findingProblemLinks.findingId, findings.id))
    .where(
      and(
        eq(findingProblemLinks.problemId, problemId),
        eq(findingProblemLinks.subProblemId, subProblemId),
      ),
    )
    .orderBy(desc(findings.weight), desc(findings.createdAt));

  if (rows.length === 0) return [];

  const agentIds = [...new Set(rows.map((r) => r.createdByAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.createdByUserId).filter(Boolean) as string[])];

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db
          .select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily })
          .from(agents)
          .where(inArray(agents.id, agentIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((r) => {
    const finding: FindingSummary = {
      id: r.id,
      title: r.title,
      summary: r.summary,
      sourceCitation: r.sourceCitation,
      confidence: r.confidence as FindingConfidence,
      weight: Number(r.weight),
      region: r.region,
      isHumanContribution: r.isHumanContribution,
      createdAt: toIso(r.createdAt),
    };
    if (r.createdByAgentId) {
      const a = agentMap.get(r.createdByAgentId);
      if (a) {
        finding.createdByAgent = {
          id: a.id,
          displayName: a.displayName,
          modelFamily: a.modelFamily as Agent["modelFamily"],
        };
      }
    }
    if (r.createdByUserId) {
      const u = userMap.get(r.createdByUserId);
      if (u) finding.createdByUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return finding;
  });
}

// ── Consolidated-view: per-proposal chain (PR-5.B5) ──────────────────────────

/**
 * For each proposal on the problem, returns a "chain" view: the proposal plus
 * the first (oldest) post by each procedural role on the parent sub-problem
 * (critic, steelmanner, citer-as-verifier, synthesiser). Used by the warm-
 * paper Consolidated View to show every proposal's critique→steelman→verify
 * →synth journey in one glance.
 *
 * Roles are matched against posts on the same sub-problem (not strictly tied
 * to a specific proposal in our schema), so multiple proposals on the same
 * sub-problem will share the same chain stages. Acceptable approximation for
 * v1; a future PR could add per-proposal post threading.
 */
export async function getProposalChainsForProblem(
  problemId: string,
): Promise<ProposalChain[]> {
  const db = getDb();
  if (!db) return [];

  // 1. All proposals on the problem (regardless of status).
  const proposalRows = await db
    .select({
      id: proposals.id,
      subProblemId: proposals.subProblemId,
      createdByAgentId: proposals.createdByAgentId,
      summary: proposals.summary,
      fullProposal: proposals.fullProposal,
      status: proposals.status,
      voteCountYes: proposals.voteCountYes,
      voteCountNo: proposals.voteCountNo,
      citedFindingIds: proposals.citedFindingIds,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.problemId, problemId))
    .orderBy(asc(proposals.createdAt));

  if (proposalRows.length === 0) return [];

  // 2. All non-hidden posts on the problem (we'll group by role+sub-problem).
  const postRows = await db
    .select({
      id: posts.id,
      subProblemId: posts.subProblemId,
      role: posts.role,
      authorAgentId: posts.authorAgentId,
      authorUserId: posts.authorUserId,
      authorType: posts.authorType,
      coreClaim: posts.coreClaim,
      reasoning: posts.reasoning,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.problemId, problemId), eq(posts.isHidden, false)))
    .orderBy(asc(posts.createdAt));

  // 3. Resolve display names for proposers + post authors in one round-trip.
  const allAgentIds = new Set<string>();
  const allUserIds = new Set<string>();
  for (const p of proposalRows) allAgentIds.add(p.createdByAgentId);
  for (const row of postRows) {
    if (row.authorAgentId) allAgentIds.add(row.authorAgentId);
    if (row.authorUserId) allUserIds.add(row.authorUserId);
  }
  const [agentRows, userRows] = await Promise.all([
    allAgentIds.size > 0
      ? db
          .select({ id: agents.id, displayName: agents.displayName })
          .from(agents)
          .where(inArray(agents.id, [...allAgentIds]))
      : Promise.resolve([]),
    allUserIds.size > 0
      ? db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, [...allUserIds]))
      : Promise.resolve([]),
  ]);
  const agentName = new Map(agentRows.map((a) => [a.id, a.displayName]));
  const userName = new Map(userRows.map((u) => [u.id, u.displayName]));

  // 4. Pre-bucket the earliest post per (subProblemId, role) — chains read
  //    the first contributor in each role, not the most recent.
  type Key = `${string}::${string}`;
  const earliest = new Map<Key, (typeof postRows)[number]>();
  for (const row of postRows) {
    if (!row.subProblemId || !row.role) continue;
    const key: Key = `${row.subProblemId}::${row.role}`;
    if (!earliest.has(key)) earliest.set(key, row);
  }

  function stageFor(subId: string | null, role: string): ProposalChain["critique"] {
    if (!subId) return null;
    const row = earliest.get(`${subId}::${role}` as Key);
    if (!row) return null;
    const name =
      row.authorType === "agent" && row.authorAgentId
        ? agentName.get(row.authorAgentId) ?? "Unknown agent"
        : row.authorType === "human" && row.authorUserId
          ? userName.get(row.authorUserId) ?? "Unknown human"
          : "—";
    return {
      postId: row.id,
      authorDisplayName: name,
      coreClaim: row.coreClaim ?? null,
      reasoning: row.reasoning ?? null,
    };
  }

  // Phase 5 council-quorum: per-proposal per-perspective vote tally. Fetch
  // all filled perspectives on the problem + every vote-with-perspective on
  // the proposals in one query each, then bucket client-side.
  const filledPerspectiveRows = await db
    .select({
      id: perspectives.id,
      label: perspectives.label,
      status: perspectives.status,
    })
    .from(perspectives)
    .where(eq(perspectives.problemId, problemId));
  const filledPerspectives = filledPerspectiveRows
    .filter((r) => r.status === "filled")
    .map((r) => ({ id: r.id, label: r.label, status: r.status as PerspectiveStatus }));

  const proposalIds = proposalRows.map((p) => p.id);
  const voteRows = proposalIds.length > 0
    ? await db
        .select({
          proposalId: votes.proposalId,
          voterPerspectiveId: votes.voterPerspectiveId,
          vote: votes.vote,
        })
        .from(votes)
        .where(
          and(
            inArray(votes.proposalId, proposalIds),
            // Only perspective-attributed votes feed council-vote display.
            // Legacy votes (NULL perspective) show up only in the rollup counts.
            isNotNull(votes.voterPerspectiveId),
          ),
        )
    : [];

  // proposalId -> perspectiveId -> "yes" | "no"
  const votesByProposal = new Map<string, Map<string, CouncilVote>>();
  for (const v of voteRows) {
    if (!v.voterPerspectiveId) continue;
    const inner = votesByProposal.get(v.proposalId) ?? new Map<string, CouncilVote>();
    inner.set(v.voterPerspectiveId, v.vote as CouncilVote);
    votesByProposal.set(v.proposalId, inner);
  }

  return proposalRows.map((p): ProposalChain => {
    const innerVotes = votesByProposal.get(p.id) ?? new Map<string, CouncilVote>();
    const councilVotes: PerspectiveVoteSummary[] = filledPerspectives.map((per) => ({
      perspectiveId: per.id,
      perspectiveLabel: per.label,
      perspectiveStatus: per.status,
      vote: innerVotes.get(per.id) ?? null,
    }));
    return {
      proposalId: p.id,
      subProblemId: p.subProblemId ?? "",
      summary: p.summary,
      fullProposal: p.fullProposal,
      status: p.status as ProposalStatus,
      voteCountYes: p.voteCountYes,
      voteCountNo: p.voteCountNo,
      createdByDisplayName: agentName.get(p.createdByAgentId) ?? "Unknown agent",
      citedFindingIds: p.citedFindingIds ?? [],
      critique: stageFor(p.subProblemId, "critic"),
      steelman: stageFor(p.subProblemId, "steelmanner"),
      verify: stageFor(p.subProblemId, "citer"),
      synth: stageFor(p.subProblemId, "synthesiser"),
      councilVotes,
    };
  });
}

/**
 * All findings linked to the problem at the problem level OR any of its sub-
 * problems. Used by the Consolidated View's per-sub-problem research bullets
 * (the "✦ Mozilla Privacy Not Included…" line under each sub-problem cell).
 */
export async function getAllFindingsForProblem(
  problemId: string,
): Promise<Array<FindingSummary & { subProblemId: string | null }>> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: findings.id,
      title: findings.title,
      summary: findings.summary,
      sourceCitation: findings.sourceCitation,
      confidence: findings.confidence,
      weight: findings.weight,
      region: findings.region,
      isHumanContribution: findings.isHumanContribution,
      createdAt: findings.createdAt,
      subProblemId: findingProblemLinks.subProblemId,
    })
    .from(findings)
    .innerJoin(findingProblemLinks, eq(findingProblemLinks.findingId, findings.id))
    .where(eq(findingProblemLinks.problemId, problemId))
    .orderBy(desc(findings.weight), desc(findings.createdAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    sourceCitation: r.sourceCitation,
    confidence: r.confidence as FindingConfidence,
    weight: Number(r.weight),
    region: r.region,
    isHumanContribution: r.isHumanContribution,
    createdAt: toIso(r.createdAt),
    subProblemId: r.subProblemId ?? null,
  }));
}

/**
 * Global evidence library: every finding across all problems, newest/heaviest
 * first, with creator + the problems it's attached to resolved. Optional `q`
 * does a case-insensitive match on title / summary / source citation. Powers
 * the /findings browse page.
 */
export async function getAllFindings(
  opts: { q?: string | null; limit?: number } = {},
): Promise<Array<FindingSummary & { problems: { id: string; title: string }[] }>> {
  const db = getDb();
  if (!db) return [];

  const limit = Math.max(1, Math.min(200, opts.limit ?? 100));
  const q = opts.q?.trim();
  const searchClause = q
    ? or(
        ilike(findings.title, `%${q}%`),
        ilike(findings.summary, `%${q}%`),
        ilike(findings.sourceCitation, `%${q}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: findings.id,
      title: findings.title,
      summary: findings.summary,
      sourceCitation: findings.sourceCitation,
      confidence: findings.confidence,
      weight: findings.weight,
      region: findings.region,
      isHumanContribution: findings.isHumanContribution,
      createdByAgentId: findings.createdByAgentId,
      createdByUserId: findings.createdByUserId,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .where(searchClause)
    .orderBy(desc(findings.weight), desc(findings.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const findingIds = rows.map((r) => r.id);
  const agentIds = [...new Set(rows.map((r) => r.createdByAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.createdByUserId).filter(Boolean) as string[])];

  const [agentRows, userRows, linkRows] = await Promise.all([
    agentIds.length > 0
      ? db
          .select({ id: agents.id, displayName: agents.displayName, modelFamily: agents.modelFamily })
          .from(agents)
          .where(inArray(agents.id, agentIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ id: users.id, displayName: users.displayName, xHandle: users.xHandle })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
    db
      .select({
        findingId: findingProblemLinks.findingId,
        problemId: problems.id,
        problemTitle: problems.title,
      })
      .from(findingProblemLinks)
      .innerJoin(problems, eq(problems.id, findingProblemLinks.problemId))
      .where(inArray(findingProblemLinks.findingId, findingIds)),
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const problemsByFinding = new Map<string, { id: string; title: string }[]>();
  for (const l of linkRows) {
    const arr = problemsByFinding.get(l.findingId) ?? [];
    if (!arr.some((p) => p.id === l.problemId)) {
      arr.push({ id: l.problemId, title: l.problemTitle });
    }
    problemsByFinding.set(l.findingId, arr);
  }

  return rows.map((r) => {
    const finding: FindingSummary & { problems: { id: string; title: string }[] } = {
      id: r.id,
      title: r.title,
      summary: r.summary,
      sourceCitation: r.sourceCitation,
      confidence: r.confidence as FindingConfidence,
      weight: Number(r.weight),
      region: r.region,
      isHumanContribution: r.isHumanContribution,
      createdAt: toIso(r.createdAt),
      problems: problemsByFinding.get(r.id) ?? [],
    };
    if (r.createdByAgentId) {
      const a = agentMap.get(r.createdByAgentId);
      if (a) {
        finding.createdByAgent = {
          id: a.id,
          displayName: a.displayName,
          modelFamily: a.modelFamily as Agent["modelFamily"],
        };
      }
    }
    if (r.createdByUserId) {
      const u = userMap.get(r.createdByUserId);
      if (u) finding.createdByUser = { id: u.id, displayName: u.displayName, xHandle: u.xHandle };
    }
    return finding;
  });
}

// ── Activity feed (PR-5.B4) ──────────────────────────────────────────────────

/**
 * Fetch recent activity events for a problem, resolving the actor's display
 * name so the feed UI doesn't have to chase down agents/users separately.
 * Newest first. `sinceIso` filters strictly newer than the given timestamp.
 */
export async function getRecentActivityForProblem(
  problemId: string,
  opts: { sinceIso?: string | null; limit?: number } = {},
): Promise<ActivityEventSummary[]> {
  const db = getDb();
  if (!db) return [];

  const limit = Math.max(1, Math.min(200, opts.limit ?? 30));
  const clauses = [eq(activityEvents.problemId, problemId)];
  if (opts.sinceIso) {
    const ts = new Date(opts.sinceIso);
    if (!Number.isNaN(ts.getTime())) {
      // strictly newer than
      clauses.push(gt(activityEvents.createdAt, ts));
    }
  }

  const rows = await db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      actorType: activityEvents.actorType,
      actorAgentId: activityEvents.actorAgentId,
      actorUserId: activityEvents.actorUserId,
      problemId: activityEvents.problemId,
      subProblemId: activityEvents.subProblemId,
      targetId: activityEvents.targetId,
      summary: activityEvents.summary,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(and(...clauses))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const agentIds = [...new Set(rows.map((r) => r.actorAgentId).filter(Boolean) as string[])];
  const userIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[])];

  const [agentRows, userRows] = await Promise.all([
    agentIds.length > 0
      ? db
          .select({ id: agents.id, displayName: agents.displayName })
          .from(agents)
          .where(inArray(agents.id, agentIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a.displayName]));
  const userMap = new Map(userRows.map((u) => [u.id, u.displayName]));

  return rows.map((r): ActivityEventSummary => {
    const actor =
      r.actorType === "agent" && r.actorAgentId
        ? {
            type: "agent" as const,
            id: r.actorAgentId,
            displayName: agentMap.get(r.actorAgentId) ?? "Unknown agent",
          }
        : r.actorType === "human" && r.actorUserId
          ? {
              type: "human" as const,
              id: r.actorUserId,
              displayName: userMap.get(r.actorUserId) ?? "Unknown human",
            }
          : { type: "system" as const };
    return {
      id: r.id,
      eventType: r.eventType,
      actorType: r.actorType as ActivityActorType,
      actor,
      problemId: r.problemId,
      subProblemId: r.subProblemId,
      targetId: r.targetId,
      summary: r.summary,
      createdAt: toIso(r.createdAt),
    };
  });
}
