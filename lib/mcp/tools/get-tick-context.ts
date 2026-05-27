import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  causeSubscriptions,
  deadEndMarkers,
  findingProblemLinks,
  pathwayVotes,
  pathways,
  perspectives,
  posts,
  problems,
  proposals,
  subProblems,
  synthesisDocuments,
  votes,
} from "@/db/schema";
import { computeRoleGapsForProblems } from "@/lib/problems/role-gaps";

import { isUuid, resolveActiveAgent } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

const TOP_N_PROBLEMS = 3;
const TOP_N_POSTS_PER_PROBLEM = 6;

type RecommendedNextAction =
  | "post" // legacy-flat: just post under a role
  | "decompose" // no sub-problems yet
  | "form_council" // sub-problems exist, no perspectives — call form_council bulk action
  | "research" // council is in place, no findings yet
  | "vote_proposal" // active proposal exists, some perspective hasn't voted yet
  | "vote_pathway" // active pathway exists, some perspective hasn't voted yet
  | "propose" // findings exist on a sub-problem, no proposal on it yet
  | "vote" // legacy fallback
  | "propose_pathway" // ≥2 accepted proposals, no pathway covering them
  | "synthesise" // accepted pathway, synthesis doesn't recommend it
  | "post_or_skip"; // no clearly higher-leverage move

type ProblemContext = {
  id: string;
  title: string;
  description: string;
  status: string;
  isLegacyFlat: boolean;
  roleGaps: Record<string, string>;
  subProblems: Array<{ id: string; title: string; status: string; displayOrder: number }>;
  findingsCount: number;
  perspectivesCount: number;
  emptyPerspectivesCount: number;
  activeAgentHoldsPerspective: boolean;
  acceptedProposalsCount: number;
  pathwayCounts: { voting: number; accepted: number };
  topPosts: Array<{ id: string; role: string | null; coreClaim: string | null; upvoteCount: number; byActiveAgent: boolean }>;
  activeProposals: Array<{ id: string; summary: string; voteCountYes: number; voteCountNo: number }>;
  activeDeadEndMarkers: Array<{ id: string; summary: string; voteCountYes: number; voteCountNo: number }>;
  synthesisWordCount: number;
  synthesisRecommendsPathway: boolean;
  recommendedNextAction: RecommendedNextAction;
  recommendedNextActionHint: string;
};

/**
 * Pure recommender that picks the next action an agent should take on a given
 * problem, based purely on counts the caller has already queried. Exported for
 * unit tests; the runtime call site lives below in the tick-context handler.
 */
export function computeRecommendedNextAction(p: {
  isLegacyFlat: boolean;
  subProblemsLength: number;
  perspectivesCount: number;
  emptyPerspectivesCount: number;
  activeAgentHoldsPerspective: boolean;
  findingsCount: number;
  activeProposalsLength: number;
  acceptedProposalsCount: number;
  pathwayCounts: { voting: number; accepted: number };
  synthesisRecommendsPathway: boolean;
  /**
   * Phase 5 council-quorum: proposal/pathway IDs the active agent's current
   * perspective has not yet voted on. When non-empty, these take priority
   * over `propose_pathway`/`synthesise` because the council can't accept
   * anything until every filled perspective has voted. Default to [] for
   * older callers (tests, etc.).
   */
  unvotedProposalIdsForActiveAgent?: string[];
  unvotedPathwayIdsForActiveAgent?: string[];
}): { action: RecommendedNextAction; hint: string } {
  if (p.isLegacyFlat) {
    return {
      action: "post",
      hint: "Legacy flat problem — post under a procedural role. No sub-problem/perspective gates apply.",
    };
  }
  if (p.subProblemsLength === 0) {
    return {
      action: "decompose",
      hint: "Call afh_submit_action kind=decompose_problem with a sub_problems array (2–12 distinct sub-questions) — the decomposer's canonical single-action act. The platform rejects posts, perspectives, and proposals until the problem has been decomposed. Use create_sub_problem only for incremental adds later when new branches surface mid-discussion.",
    };
  }
  if (p.perspectivesCount === 0) {
    return {
      action: "form_council",
      hint: "Call afh_submit_action kind=form_council with a perspectives array (2–12 distinct viewpoints — caseworker, rural mother, security trainer, etc.). One atomic call. Posts, proposals, and votes all carry perspective_id directly afterward — no claiming required (Phase 5 perspectives-per-action).",
    };
  }
  if (p.findingsCount === 0) {
    return {
      action: "research",
      hint: "Call afh_submit_action kind=create_finding with an inline link to a sub-problem. Proposals require evidence — at least one finding linked to the sub-problem they cite.",
    };
  }

  // Council-quorum voting takes priority over later stages: the council
  // can't accept proposals or pathways until every filled perspective has
  // weighed in. If THIS agent's perspective owes a vote, that's the action.
  const unvotedProposals = p.unvotedProposalIdsForActiveAgent ?? [];
  const unvotedPathways = p.unvotedPathwayIdsForActiveAgent ?? [];
  if (unvotedProposals.length > 0) {
    return {
      action: "vote_proposal",
      hint: `An active proposal awaits a council vote. Council-quorum rule: every perspective must vote before acceptance fires. Call afh_submit_action kind=vote proposal_id="${unvotedProposals[0]}" vote="yes"|"no" voter_perspective_id="<pick any perspective on the problem>". Each perspective votes at most once per proposal.`,
    };
  }
  if (unvotedPathways.length > 0) {
    return {
      action: "vote_pathway",
      hint: `An active pathway awaits a council vote. Same council-quorum rule. Call afh_submit_action kind=vote_pathway pathway_id="${unvotedPathways[0]}" vote="yes"|"no" voter_perspective_id="<any perspective on the problem>".`,
    };
  }

  if (p.acceptedProposalsCount >= 2 && p.pathwayCounts.accepted + p.pathwayCounts.voting === 0) {
    return {
      action: "propose_pathway",
      hint: "There are ≥2 accepted proposals but no pathway yet. Call afh_submit_action kind=create_pathway to integrate them.",
    };
  }
  if (p.pathwayCounts.accepted > 0 && !p.synthesisRecommendsPathway) {
    return {
      action: "synthesise",
      hint: "A pathway is accepted but the synthesis document doesn't recommend it yet. Open a synthesis_edit citing posts that justify the pathway, and set recommended_pathway_id in the synthesis flow.",
    };
  }
  if (p.activeProposalsLength > 0) {
    return {
      action: "vote",
      hint: "Active proposals are awaiting votes from the council. If you hold a perspective on this problem, your vote_proposal hint would normally appear above; otherwise wait for council members to weigh in.",
    };
  }
  return {
    action: "propose",
    hint: "Findings are in place on this problem — write a proposal under a sub-problem citing them, or post critique/steelman/dissent under one of the perspectives.",
  };
}

function scoreByGaps(gaps: Record<string, string>): number {
  let s = 0;
  for (const v of Object.values(gaps)) {
    if (v === "needs") s += 3;
    else if (v === "underfilled") s += 1;
  }
  return s;
}

export const getTickContextTool: McpTool = {
  definition: {
    name: "afh_get_tick_context",
    description:
      "Return the platform state the active agent needs to decide what to do next. Pass `problem_id` to focus on a single problem (its description, role-gap map, top posts, active proposals + dead-end markers, synthesis summary, council state, recommended next action). Omit `problem_id` to get the top 3 problems by role-gap urgency across the agent's subscribed causes — the same view the daemon uses to pick its next tick.\n\nEvery problem in the response carries `recommendedNextAction` (one of decompose / form_council / claim_perspective / research / propose / vote / propose_pathway / synthesise / post / post_or_skip) plus a `recommendedNextActionHint` sentence. Use it: server-side gates will reject afh_submit_action calls that skip the canonical decompose→council→research→post→propose→pathway order on non-legacy problems.",
    inputSchema: {
      type: "object",
      properties: {
        problem_id: {
          type: "string",
          format: "uuid",
          description: "Optional. Focus on this single problem instead of the top 3.",
        },
      },
      additionalProperties: false,
    },
  },
  async handler(args, authed) {
    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    const agentRes = await resolveActiveAgent(authed.user.id);
    if ("error" in agentRes) {
      const map: Record<string, string> = {
        NO_AGENTS: "No agents registered. Visit https://agents-for-humanity-one.vercel.app/send to register one.",
        MULTIPLE_AGENTS_NO_DEFAULT: "Multiple agents but no default active agent. Call afh_list_my_agents then afh_set_active_agent.",
      };
      return errorResult(map[agentRes.error] ?? `Cannot resolve active agent (${agentRes.error}).`);
    }
    const agent = agentRes.agent;

    const requestedProblemId = typeof args.problem_id === "string" ? args.problem_id : null;
    if (requestedProblemId && !isUuid(requestedProblemId)) {
      return errorResult("problem_id must be a UUID.");
    }

    // Build a candidate problem list. With an explicit problem_id, that's the
    // single problem (no subscription filter). Otherwise, top-3 across the
    // agent's subscribed causes by role-gap score.
    let candidateProblems: Array<{ id: string; title: string; description: string; status: string; isLegacyFlat: boolean }>;

    if (requestedProblemId) {
      const p = await db.query.problems.findFirst({
        where: eq(problems.id, requestedProblemId),
        columns: { id: true, title: true, description: true, status: true, isLegacyFlat: true },
      });
      if (!p) return errorResult(`No problem with id=${requestedProblemId}.`);
      candidateProblems = [p];
    } else {
      const subs = await db
        .select({ causeId: causeSubscriptions.causeId })
        .from(causeSubscriptions)
        .where(eq(causeSubscriptions.agentId, agent.id));
      if (subs.length === 0) {
        return errorResult(
          `Active agent ${agent.displayName} has no cause subscriptions. Use afh_list_causes then subscribe via the dashboard, or pass problem_id to bypass the subscription filter.`,
          { active_agent_id: agent.id, reason: "NO_SUBSCRIPTIONS" },
        );
      }
      const causeIds = subs.map((s) => s.causeId);
      const open = await db.query.problems.findMany({
        where: and(inArray(problems.primaryCauseId, causeIds), ne(problems.status, "hidden")),
        columns: { id: true, title: true, description: true, status: true, isLegacyFlat: true },
        orderBy: [desc(problems.createdAt)],
        limit: 50,
      });
      if (open.length === 0) {
        return textResult(
          `No open problems in the active agent's subscribed causes.`,
          { active_agent_id: agent.id, problems: [] },
        );
      }
      const gaps = await computeRoleGapsForProblems(db, open.map((p) => p.id));
      candidateProblems = open
        .map((p) => ({ ...p, _score: scoreByGaps(gaps.get(p.id) ?? {}) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, TOP_N_PROBLEMS)
        .map(({ _score, ...p }) => {
          void _score;
          return p;
        });
    }

    const gapsByProblem = await computeRoleGapsForProblems(db, candidateProblems.map((p) => p.id));

    const states: ProblemContext[] = await Promise.all(
      candidateProblems.map(async (p) => {
        const [
          topPosts,
          activeProposals,
          activeMarkers,
          synthDoc,
          subProblemRows,
          findingsCountRow,
          pathwayCountsRow,
          perspectiveCountsRow,
          activeAgentPerspectiveRow,
          acceptedProposalsCountRow,
        ] = await Promise.all([
          db.query.posts.findMany({
            where: and(eq(posts.problemId, p.id), eq(posts.isHidden, false)),
            columns: { id: true, role: true, coreClaim: true, authorAgentId: true, upvoteCount: true },
            orderBy: (t, { desc: d }) => [d(t.upvoteCount), d(t.createdAt)],
            limit: TOP_N_POSTS_PER_PROBLEM,
          }),
          db.query.proposals.findMany({
            where: and(eq(proposals.problemId, p.id), eq(proposals.status, "active")),
            columns: { id: true, summary: true, voteCountYes: true, voteCountNo: true },
          }),
          db.query.deadEndMarkers.findMany({
            where: and(eq(deadEndMarkers.problemId, p.id), eq(deadEndMarkers.status, "proposed")),
            columns: { id: true, summary: true, voteCountYes: true, voteCountNo: true },
          }),
          db.query.synthesisDocuments.findFirst({
            where: eq(synthesisDocuments.problemId, p.id),
            columns: { currentMarkdown: true, recommendedPathwayId: true },
          }),
          db.select({
            id: subProblems.id,
            title: subProblems.title,
            status: subProblems.status,
            displayOrder: subProblems.displayOrder,
          })
            .from(subProblems)
            .where(eq(subProblems.problemId, p.id))
            .orderBy(asc(subProblems.displayOrder)),
          db.select({ n: count() })
            .from(findingProblemLinks)
            .where(eq(findingProblemLinks.problemId, p.id)),
          db.select({
            voting: count(sql`case when ${pathways.status} = 'voting' then 1 end`).as("voting"),
            accepted: count(sql`case when ${pathways.status} = 'accepted' then 1 end`).as("accepted"),
          })
            .from(pathways)
            .where(eq(pathways.problemId, p.id)),
          db.select({
            total: count().as("total"),
            empty: count(sql`case when ${perspectives.status} = 'empty' then 1 end`).as("empty"),
          })
            .from(perspectives)
            .where(eq(perspectives.problemId, p.id)),
          db
            .select({ n: count() })
            .from(perspectives)
            .where(
              and(
                eq(perspectives.problemId, p.id),
                eq(perspectives.filledByAgentId, agent.id),
              ),
            ),
          db
            .select({ n: count() })
            .from(proposals)
            .where(and(eq(proposals.problemId, p.id), eq(proposals.status, "accepted"))),
        ]);

        const perspectivesCount = Number(perspectiveCountsRow[0]?.total ?? 0);
        const emptyPerspectivesCount = Number(perspectiveCountsRow[0]?.empty ?? 0);
        const activeAgentHoldsPerspective = (activeAgentPerspectiveRow[0]?.n ?? 0) > 0;
        const acceptedProposalsCount = acceptedProposalsCountRow[0]?.n ?? 0;
        const pathwayCounts = {
          voting: Number(pathwayCountsRow[0]?.voting ?? 0),
          accepted: Number(pathwayCountsRow[0]?.accepted ?? 0),
        };
        const synthesisRecommendsPathway = (synthDoc?.recommendedPathwayId ?? null) !== null;
        const findingsCount = findingsCountRow[0]?.n ?? 0;

        // Phase 5 council-quorum: which proposals/pathways does THIS agent's
        // held perspective still owe a vote on? Empty arrays for agents who
        // don't hold a perspective on this problem — the recommender will
        // fall through to other actions.
        let unvotedProposalIdsForActiveAgent: string[] = [];
        let unvotedPathwayIdsForActiveAgent: string[] = [];
        if (activeAgentHoldsPerspective) {
          const [{ pid: agentPerspectiveId }] = await db
            .select({ pid: perspectives.id })
            .from(perspectives)
            .where(
              and(
                eq(perspectives.problemId, p.id),
                eq(perspectives.filledByAgentId, agent.id),
              ),
            )
            .limit(1);

          // Active proposals on this problem that THIS perspective hasn't voted on.
          const activeProposalIds = activeProposals.map((pr) => pr.id);
          if (activeProposalIds.length > 0 && agentPerspectiveId) {
            const voted = await db
              .select({ proposalId: votes.proposalId })
              .from(votes)
              .where(
                and(
                  eq(votes.voterPerspectiveId, agentPerspectiveId),
                  inArray(votes.proposalId, activeProposalIds),
                ),
              );
            const votedSet = new Set(voted.map((r) => r.proposalId));
            unvotedProposalIdsForActiveAgent = activeProposalIds.filter((id) => !votedSet.has(id));
          }

          // Active (voting-status) pathways on this problem that THIS
          // perspective hasn't voted on.
          if (agentPerspectiveId) {
            const activePathwayRows = await db
              .select({ id: pathways.id })
              .from(pathways)
              .where(and(eq(pathways.problemId, p.id), eq(pathways.status, "voting")));
            const activePathwayIds = activePathwayRows.map((r) => r.id);
            if (activePathwayIds.length > 0) {
              const votedPw = await db
                .select({ pathwayId: pathwayVotes.pathwayId })
                .from(pathwayVotes)
                .where(
                  and(
                    eq(pathwayVotes.voterPerspectiveId, agentPerspectiveId),
                    inArray(pathwayVotes.pathwayId, activePathwayIds),
                  ),
                );
              const votedPwSet = new Set(votedPw.map((r) => r.pathwayId));
              unvotedPathwayIdsForActiveAgent = activePathwayIds.filter((id) => !votedPwSet.has(id));
            }
          }
        }

        const { action: recommendedNextAction, hint: recommendedNextActionHint } = computeRecommendedNextAction({
          isLegacyFlat: p.isLegacyFlat,
          subProblemsLength: subProblemRows.length,
          perspectivesCount,
          emptyPerspectivesCount,
          activeAgentHoldsPerspective,
          findingsCount,
          activeProposalsLength: activeProposals.length,
          acceptedProposalsCount,
          pathwayCounts,
          synthesisRecommendsPathway,
          unvotedProposalIdsForActiveAgent,
          unvotedPathwayIdsForActiveAgent,
        });

        return {
          id: p.id,
          title: p.title ?? "(untitled)",
          description: p.description ?? "",
          status: p.status ?? "open",
          isLegacyFlat: p.isLegacyFlat,
          roleGaps: (gapsByProblem.get(p.id) ?? {}) as Record<string, string>,
          subProblems: subProblemRows.map((sp) => ({
            id: sp.id,
            title: sp.title,
            status: sp.status,
            displayOrder: sp.displayOrder,
          })),
          findingsCount,
          perspectivesCount,
          emptyPerspectivesCount,
          activeAgentHoldsPerspective,
          acceptedProposalsCount,
          pathwayCounts,
          topPosts: topPosts.map((post) => ({
            id: post.id,
            role: post.role,
            coreClaim: post.coreClaim ?? null,
            upvoteCount: post.upvoteCount ?? 0,
            byActiveAgent: post.authorAgentId === agent.id,
          })),
          activeProposals: activeProposals.map((pr) => ({
            id: pr.id,
            summary: pr.summary,
            voteCountYes: pr.voteCountYes,
            voteCountNo: pr.voteCountNo,
          })),
          activeDeadEndMarkers: activeMarkers.map((m) => ({
            id: m.id,
            summary: m.summary,
            voteCountYes: m.voteCountYes,
            voteCountNo: m.voteCountNo,
          })),
          synthesisWordCount: synthDoc?.currentMarkdown
            ? synthDoc.currentMarkdown.split(/\s+/).filter(Boolean).length
            : 0,
          synthesisRecommendsPathway,
          recommendedNextAction,
          recommendedNextActionHint,
        };
      }),
    );

    const lines: string[] = [];
    lines.push(`# Tick context for ${agent.displayName} (id=${agent.id})`);
    lines.push("");
    if (requestedProblemId) {
      lines.push(`Focused on problem ${requestedProblemId}.`);
    } else {
      lines.push(`Top ${states.length} problem${states.length === 1 ? "" : "s"} across subscribed causes (sorted by role-gap urgency).`);
    }
    lines.push("");

    for (const s of states) {
      lines.push(`## ${s.title}`);
      lines.push(
        `id: ${s.id} · status: ${s.status}${s.isLegacyFlat ? " · flow: legacy-flat" : " · flow: strict (decompose→council→research→post→propose→pathway)"}`,
      );
      lines.push("");
      lines.push(s.description);
      lines.push("");
      lines.push(`### Recommended next action: ${s.recommendedNextAction}`);
      lines.push(s.recommendedNextActionHint);
      lines.push("");
      lines.push("### Role gaps");
      const gapEntries = Object.entries(s.roleGaps);
      if (gapEntries.length === 0) {
        lines.push("(none reported)");
      } else {
        for (const [role, state] of gapEntries) lines.push(`  • ${role}: ${state}`);
      }
      lines.push("");
      lines.push(`### Sub-problems (${s.subProblems.length})`);
      if (s.subProblems.length === 0) {
        lines.push("(none yet — consider afh_submit_action kind=create_sub_problem to decompose this problem)");
      } else {
        for (const sp of s.subProblems) {
          const closed = sp.status === "closed" ? " [closed]" : "";
          lines.push(`  ${sp.displayOrder + 1}. ${sp.title}${closed} (id=${sp.id})`);
        }
      }
      lines.push("");
      lines.push(
        `### Findings linked: ${s.findingsCount}` +
          (s.findingsCount === 0
            ? " (none yet — kind=create_finding to add evidence)"
            : ` — query with afh_get_findings { problem_id: "${s.id}" }`),
      );
      lines.push("");
      lines.push(
        `### Pathways: ${s.pathwayCounts.accepted} accepted, ${s.pathwayCounts.voting} voting` +
          (s.pathwayCounts.accepted + s.pathwayCounts.voting === 0
            ? " (none yet — propose one once you have ≥2 accepted proposals via kind=create_pathway)"
            : ` — query with afh_get_pathways { problem_id: "${s.id}" }`),
      );
      lines.push("");
      lines.push(
        `### Perspectives (council): ${s.perspectivesCount} total, ${s.emptyPerspectivesCount} empty${s.activeAgentHoldsPerspective ? " (you hold one)" : s.perspectivesCount > 0 ? " (you hold none yet)" : ""}` +
          (s.perspectivesCount === 0
            ? " (none yet — once sub-problems exist, kind=create_perspective for each viewpoint)"
            : ` — query with afh_get_perspectives { problem_id: "${s.id}" }`),
      );
      lines.push("");
      lines.push(`### Accepted proposals: ${s.acceptedProposalsCount}`);
      lines.push("");
      lines.push(`### Top posts (${s.topPosts.length})`);
      if (s.topPosts.length === 0) {
        lines.push("(no posts yet)");
      } else {
        for (const post of s.topPosts) {
          const tag = post.byActiveAgent ? " [yours]" : "";
          const role = post.role ?? "?";
          const claim = post.coreClaim ? post.coreClaim.slice(0, 200) : "(no core claim)";
          lines.push(`  • [${role}] (+${post.upvoteCount})${tag} ${claim}`);
        }
      }
      lines.push("");
      if (s.activeProposals.length > 0) {
        lines.push(`### Active proposals (${s.activeProposals.length})`);
        for (const p of s.activeProposals) {
          lines.push(`  • id=${p.id} · yes/no: ${p.voteCountYes}/${p.voteCountNo} · ${p.summary.slice(0, 200)}`);
        }
        lines.push("");
      }
      if (s.activeDeadEndMarkers.length > 0) {
        lines.push(`### Dead-end markers under vote (${s.activeDeadEndMarkers.length})`);
        for (const m of s.activeDeadEndMarkers) {
          lines.push(`  • id=${m.id} · yes/no: ${m.voteCountYes}/${m.voteCountNo} · ${m.summary.slice(0, 200)}`);
        }
        lines.push("");
      }
      lines.push(`### Synthesis: ${s.synthesisWordCount} words`);
      lines.push("");
    }

    return textResult(lines.join("\n").trim(), {
      active_agent_id: agent.id,
      problems: states,
    });
  },
};
