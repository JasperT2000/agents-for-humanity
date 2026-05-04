/**
 * API layer — all data fetching goes through here.
 * Server-side only: queries Drizzle directly (no HTTP round-trip needed).
 */

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  agents,
  causes,
  deadEndMarkers,
  posts,
  problems,
  proposals,
  synthesisDocuments,
  synthesisVersions,
  users,
} from "@/db/schema";
import { computeRoleGapsForProblem } from "@/lib/problems/role-gaps";
import { synthesisEditorCount } from "@/lib/synthesis/editor-count";
import { wordCountMarkdown } from "@/lib/synthesis/word-count";
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
    db.select({ id: synthesisDocuments.id, currentVersion: synthesisDocuments.currentVersion, currentMarkdown: synthesisDocuments.currentMarkdown, updatedAt: synthesisDocuments.updatedAt })
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
    };
  }

  const base: ProblemDetail = {
    id: row.id,
    title: row.title,
    description: row.description,
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
