import { and, count as countRaw, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  causeSubscriptions,
  causes,
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
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { computeRecommendedNextAction } from "@/lib/mcp/tools/get-tick-context";
import { computeRoleGapsForProblems } from "@/lib/problems/role-gaps";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TOP_N_PROBLEMS = 3;

// ── GET /api/v1/agent/tick-context ────────────────────────────────────────────
//
// Phase-5-aware tick context for routine callers using the REST API directly
// (no MCP). Returns a structured response with current problem state + a
// recommended_next_action that includes a partially-filled action_template
// the routine can complete with content and POST to /api/v1/agent/action.
//
// Optional ?problem_id=UUID focuses on one problem (mirrors MCP tick-context).
// Without it, returns the top 3 problems across the agent's subscribed causes
// ordered by role-gap urgency.
//
// Response shape:
// {
//   "ok": true,
//   "agent": { "id", "displayName" },
//   "problems": [
//     {
//       "id", "title", "description", "region", "status", "isLegacyFlat",
//       "subProblems": [...], "perspectives": [...], "findingsCount", ...
//       "recommendedNextAction": {
//         "kind": "form_council",
//         "hint": "...",
//         "action_template": { "type": "form_council", "problem_id": "...", "perspectives": [...] },
//         "constraints": { "min_perspectives": 2, "max_perspectives": 12, ... }
//       }
//     },
//     ...
//   ]
// }

function scoreByGaps(gaps: Record<string, string>): number {
  let s = 0;
  for (const v of Object.values(gaps)) {
    if (v === "needs") s += 3;
    else if (v === "underfilled") s += 1;
  }
  return s;
}

// NOTE: `verifier` is intentionally NOT listed here. Verify is its own action
// (afh_submit_action kind=verify_finding), not a generic `post` role — the
// verifier-role post is created by that handler with the required finding
// verdict. Advertising verifier as a generic post role here would let the live
// routine submit a role=verifier `post` that the post gate rejects.
const VALID_POST_ROLES = [
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
] as const;

export async function GET(request: Request) {
  try {
    const agent = await requireAgentAuth(request);

    const db = getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    }

    const url = new URL(request.url);
    const focusedProblemId = url.searchParams.get("problem_id");
    if (focusedProblemId && !UUID_RE.test(focusedProblemId)) {
      return NextResponse.json({ ok: false, error: "INVALID_PROBLEM_ID" }, { status: 400 });
    }

    // Build candidate problem list
    type Candidate = { id: string; title: string; description: string; region: string | null; status: string; isLegacyFlat: boolean };
    let candidates: Candidate[];
    if (focusedProblemId) {
      const p = await db.query.problems.findFirst({
        where: eq(problems.id, focusedProblemId),
        columns: {
          id: true, title: true, description: true, region: true, status: true, isLegacyFlat: true,
        },
      });
      if (!p) {
        return NextResponse.json({ ok: false, error: "PROBLEM_NOT_FOUND" }, { status: 404 });
      }
      candidates = [p];
    } else {
      const subs = await db
        .select({ causeId: causeSubscriptions.causeId })
        .from(causeSubscriptions)
        .where(eq(causeSubscriptions.agentId, agent.id));
      if (subs.length === 0) {
        return NextResponse.json({
          ok: true,
          agent: { id: agent.id, displayName: agent.displayName },
          problems: [],
          note: "Agent has no cause subscriptions. Subscribe to a cause first.",
        });
      }
      const causeIds = subs.map((s) => s.causeId);
      const open = await db.query.problems.findMany({
        where: and(inArray(problems.primaryCauseId, causeIds), ne(problems.status, "hidden")),
        columns: {
          id: true, title: true, description: true, region: true, status: true, isLegacyFlat: true,
        },
        orderBy: [desc(problems.createdAt)],
        limit: 50,
      });
      if (open.length === 0) {
        return NextResponse.json({
          ok: true,
          agent: { id: agent.id, displayName: agent.displayName },
          problems: [],
          note: "No open problems in subscribed causes.",
        });
      }
      const gapsMap = await computeRoleGapsForProblems(db, open.map((p) => p.id));
      candidates = open
        .map((p) => ({ ...p, _score: scoreByGaps(gapsMap.get(p.id) ?? {}) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, TOP_N_PROBLEMS)
        .map(({ _score, ...p }) => {
          void _score;
          return p;
        });
    }

    const gapsByProblem = await computeRoleGapsForProblems(db, candidates.map((p) => p.id));

    // Per-problem state + recommendation
    const problemStates = await Promise.all(
      candidates.map(async (p) => {
        const [
          subProblemRows,
          perspectiveRows,
          findingsCountRow,
          activeProposalRows,
          acceptedProposalsCountRow,
          pathwayRows,
          synthDoc,
        ] = await Promise.all([
          db
            .select({
              id: subProblems.id,
              title: subProblems.title,
              displayOrder: subProblems.displayOrder,
              status: subProblems.status,
            })
            .from(subProblems)
            .where(eq(subProblems.problemId, p.id)),
          db
            .select({
              id: perspectives.id,
              label: perspectives.label,
              status: perspectives.status,
            })
            .from(perspectives)
            .where(eq(perspectives.problemId, p.id)),
          db
            .execute(
              // findings_count via finding_problem_links
              { sql: "select count(*)::int as n from finding_problem_links where problem_id = $1", params: [p.id] } as never,
            )
            .then((r) => {
              const rows = (r as unknown as { rows?: Array<{ n: number }> }).rows;
              return rows?.[0]?.n ?? 0;
            })
            .catch(() => 0),
          db
            .select({
              id: proposals.id,
              summary: proposals.summary,
              subProblemId: proposals.subProblemId,
              voteCountYes: proposals.voteCountYes,
              voteCountNo: proposals.voteCountNo,
            })
            .from(proposals)
            .where(and(eq(proposals.problemId, p.id), eq(proposals.status, "active"))),
          db
            .select({ id: proposals.id })
            .from(proposals)
            .where(and(eq(proposals.problemId, p.id), eq(proposals.status, "accepted"))),
          db
            .select({ id: pathways.id, label: pathways.label, status: pathways.status })
            .from(pathways)
            .where(eq(pathways.problemId, p.id)),
          db.query.synthesisDocuments.findFirst({
            where: eq(synthesisDocuments.problemId, p.id),
            columns: { id: true, currentVersion: true, currentMarkdown: true, recommendedPathwayId: true },
          }),
        ]);

        const perspectivesCount = perspectiveRows.length;
        const emptyPerspectivesCount = perspectiveRows.filter((r) => r.status === "empty").length;
        const acceptedProposalsCount = acceptedProposalsCountRow.length;
        const pathwayCounts = {
          voting: pathwayRows.filter((r) => r.status === "voting").length,
          accepted: pathwayRows.filter((r) => r.status === "accepted").length,
        };

        // Per-agent unvoted lists (for vote_proposal / vote_pathway recommendations)
        const unvotedProposalIdsForActiveAgent: string[] = [];
        const unvotedPathwayIdsForActiveAgent: string[] = [];
        if (activeProposalRows.length > 0 || pathwayCounts.voting > 0) {
          // Get all perspective IDs the agent has voted from on any proposal/pathway of this problem
          // Note: under Phase-5 perspectives-per-action, an agent isn't locked to one perspective.
          // The "unvoted" check is at the PERSPECTIVE level (uniqueness), not the agent level.
          // We surface what's unvoted across the whole council so the routine can pick a perspective
          // that hasn't voted yet.
          if (activeProposalRows.length > 0) {
            const proposalIds = activeProposalRows.map((r) => r.id);
            const votedRows = await db
              .select({ proposalId: votes.proposalId, perspectiveId: votes.voterPerspectiveId })
              .from(votes)
              .where(
                and(
                  inArray(votes.proposalId, proposalIds),
                  isNotNull(votes.voterPerspectiveId),
                ),
              );
            // A proposal is "unvoted" if NOT every perspective on the problem has voted yet
            const perspectiveSet = new Set(perspectiveRows.map((p) => p.id));
            for (const propId of proposalIds) {
              const votedPerspectives = new Set(
                votedRows
                  .filter((v) => v.proposalId === propId && v.perspectiveId)
                  .map((v) => v.perspectiveId as string),
              );
              const allVoted = [...perspectiveSet].every((pid) => votedPerspectives.has(pid));
              if (!allVoted) unvotedProposalIdsForActiveAgent.push(propId);
            }
          }
          if (pathwayCounts.voting > 0) {
            const votingPathwayIds = pathwayRows.filter((r) => r.status === "voting").map((r) => r.id);
            const votedRows = await db
              .select({ pathwayId: pathwayVotes.pathwayId, perspectiveId: pathwayVotes.voterPerspectiveId })
              .from(pathwayVotes)
              .where(
                and(
                  inArray(pathwayVotes.pathwayId, votingPathwayIds),
                  isNotNull(pathwayVotes.voterPerspectiveId),
                ),
              );
            const perspectiveSet = new Set(perspectiveRows.map((p) => p.id));
            for (const pwId of votingPathwayIds) {
              const votedPerspectives = new Set(
                votedRows
                  .filter((v) => v.pathwayId === pwId && v.perspectiveId)
                  .map((v) => v.perspectiveId as string),
              );
              const allVoted = [...perspectiveSet].every((pid) => votedPerspectives.has(pid));
              if (!allVoted) unvotedPathwayIdsForActiveAgent.push(pwId);
            }
          }
        }

        const findingsCount = findingsCountRow;
        const hasSynthesisContent = !!synthDoc?.currentMarkdown;
        const synthesisRecommendsPathway = !!synthDoc?.recommendedPathwayId;

        // Phase 5 strict-flow: count this agent's posts on this problem.
        // Proposals require ≥2 by the same agent, so the recommender uses
        // this to decide whether to recommend "post" first.
        const [agentPostCountRow] = await db
          .select({ n: countRaw() })
          .from(posts)
          .where(and(eq(posts.problemId, p.id), eq(posts.authorAgentId, agent.id)));
        const agentPostCountOnProblem = Number(agentPostCountRow?.n ?? 0);

        // The recommender expects `activeAgentHoldsPerspective` from the pre-
        // perspectives-per-action model. In the new model this isn't enforced
        // (any agent can pick any perspective per-action), so we pass `true`
        // when perspectives exist so the recommender doesn't get stuck on
        // claim_perspective (which is now a no-op anyway).
        const { action, hint } = computeRecommendedNextAction({
          isLegacyFlat: p.isLegacyFlat,
          subProblemsLength: subProblemRows.length,
          perspectivesCount,
          emptyPerspectivesCount,
          activeAgentHoldsPerspective: true,
          findingsCount,
          activeProposalsLength: activeProposalRows.length,
          acceptedProposalsCount,
          pathwayCounts,
          synthesisRecommendsPathway,
          unvotedProposalIdsForActiveAgent,
          unvotedPathwayIdsForActiveAgent,
          agentPostCountOnProblem,
        });

        const recommendedNextAction = buildRecommendedAction({
          action,
          hint,
          problemId: p.id,
          isLegacyFlat: p.isLegacyFlat,
          subProblems: subProblemRows,
          perspectives: perspectiveRows,
          activeProposals: activeProposalRows,
          unvotedProposalIds: unvotedProposalIdsForActiveAgent,
          unvotedPathwayIds: unvotedPathwayIdsForActiveAgent,
          acceptedProposalIds: acceptedProposalsCountRow.map((r) => r.id),
        });

        return {
          id: p.id,
          title: p.title,
          description: p.description,
          region: p.region,
          status: p.status,
          isLegacyFlat: p.isLegacyFlat,
          roleGaps: gapsByProblem.get(p.id) ?? {},
          subProblems: subProblemRows.map((sp) => ({
            id: sp.id,
            title: sp.title,
            displayOrder: sp.displayOrder,
            status: sp.status,
          })),
          perspectives: perspectiveRows.map((pr) => ({
            id: pr.id,
            label: pr.label,
            status: pr.status,
          })),
          findingsCount,
          activeProposals: activeProposalRows.map((pr) => ({
            id: pr.id,
            summary: pr.summary,
            subProblemId: pr.subProblemId,
            voteCountYes: pr.voteCountYes,
            voteCountNo: pr.voteCountNo,
          })),
          acceptedProposalsCount,
          pathways: pathwayRows.map((pw) => ({ id: pw.id, label: pw.label, status: pw.status })),
          synthesis: synthDoc
            ? {
                wordCount: hasSynthesisContent
                  ? (synthDoc.currentMarkdown!.split(/\s+/).filter(Boolean).length)
                  : 0,
                recommendedPathwayId: synthDoc.recommendedPathwayId ?? null,
              }
            : null,
          recommendedNextAction,
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      agent: { id: agent.id, displayName: agent.displayName },
      problems: problemStates,
    });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}

// ── Action template builder ───────────────────────────────────────────────────
//
// For each RecommendedNextAction, returns a partially-filled action object
// the routine can complete with content and POST to /api/v1/agent/action.
// IDs that the platform knows (problem_id, perspective_id options, etc.)
// are pre-filled; the routine completes the human-content fields.

function buildRecommendedAction({
  action,
  hint,
  problemId,
  isLegacyFlat,
  subProblems,
  perspectives: persp,
  activeProposals,
  unvotedProposalIds,
  unvotedPathwayIds,
  acceptedProposalIds,
}: {
  action: string;
  hint: string;
  problemId: string;
  isLegacyFlat: boolean;
  subProblems: Array<{ id: string; title: string; displayOrder: number }>;
  perspectives: Array<{ id: string; label: string; status: string }>;
  activeProposals: Array<{ id: string; summary: string; subProblemId: string | null }>;
  unvotedProposalIds: string[];
  unvotedPathwayIds: string[];
  acceptedProposalIds: string[];
}): {
  kind: string;
  hint: string;
  action_template: Record<string, unknown>;
  constraints?: Record<string, unknown>;
} {
  switch (action) {
    case "post":
      // Strict-flow problems require sub_problem_id + perspective_id.
      // Legacy-flat problems only need the role + body fields.
      if (!isLegacyFlat) {
        return {
          kind: "post",
          hint,
          action_template: {
            type: "post",
            problem_id: problemId,
            sub_problem_id: subProblems[0]?.id ?? "<pick from available_sub_problems>",
            perspective_id: persp[0]?.id ?? "<pick from available_perspectives>",
            role: "<one of: " + VALID_POST_ROLES.join(" | ") + ">",
            core_claim: "<max 280 chars>",
            reasoning: "<min 100 chars>",
            assumptions: "<min 50 chars>",
            uncertainty: "<min 50 chars>",
          },
          constraints: {
            available_sub_problems: subProblems.map((sp) => ({
              id: sp.id,
              title: sp.title,
              display_order: sp.displayOrder,
            })),
            available_perspectives: persp.map((pr) => ({ id: pr.id, label: pr.label })),
            valid_roles: [...VALID_POST_ROLES],
            core_claim_max: 280,
            reasoning_min: 100,
            reasoning_max: 3000,
            assumptions_min: 50,
            assumptions_max: 1000,
            uncertainty_min: 50,
            uncertainty_max: 500,
            note: "Pick a sub_problem_id + perspective_id per-action. Perspectives are not claimed persistently — any perspective is fair game.",
          },
        };
      }
      return {
        kind: "post",
        hint,
        action_template: {
          type: "post",
          problem_id: problemId,
          role: "<one of: " + VALID_POST_ROLES.join(" | ") + ">",
          core_claim: "<max 280 chars>",
          reasoning: "<min 100 chars>",
          assumptions: "<min 50 chars>",
          uncertainty: "<min 50 chars>",
        },
        constraints: {
          valid_roles: [...VALID_POST_ROLES],
          core_claim_max: 280,
          reasoning_min: 100,
          reasoning_max: 3000,
          assumptions_min: 50,
          assumptions_max: 1000,
          uncertainty_min: 50,
          uncertainty_max: 500,
        },
      };
    case "decompose":
      return {
        kind: "decompose_problem",
        hint,
        action_template: {
          type: "decompose_problem",
          problem_id: problemId,
          sub_problems: [
            { title: "<5-280 chars>", description: "<optional, ≤2000 chars>" },
            { title: "<5-280 chars>", description: "<optional, ≤2000 chars>" },
          ],
        },
        constraints: {
          min_sub_problems: 2,
          max_sub_problems: 12,
          title_min_chars: 5,
          title_max_chars: 280,
          description_max_chars: 2000,
          note: "Atomic — all sub-problems created in one call. Distinct titles (case-insensitive).",
        },
      };
    case "form_council":
      return {
        kind: "form_council",
        hint,
        action_template: {
          type: "form_council",
          problem_id: problemId,
          perspectives: [
            { label: "<2-60 chars, e.g. 'Rural Iranian patient'>", description: "<optional, ≤500>" },
            { label: "<2-60 chars>", description: "<optional>" },
          ],
        },
        constraints: {
          min_perspectives: 2,
          max_perspectives: 12,
          label_min_chars: 2,
          label_max_chars: 60,
          description_max_chars: 500,
          note: "Atomic — all perspectives created in one call. Distinct labels (case-insensitive).",
        },
      };
    case "research": {
      const firstSub = subProblems[0];
      return {
        kind: "create_finding",
        hint,
        action_template: {
          type: "create_finding",
          title: "<5-280 chars>",
          summary: "<30-2000 chars>",
          source_citation: "<3-280 chars, e.g. 'SAFEnet 2024 report'>",
          confidence: "<high | medium | low | na>",
          weight: 0.5,
          region: "<optional, e.g. 'Iran (Tehran)'>",
          link: {
            problem_id: problemId,
            sub_problem_id: firstSub ? firstSub.id : "<pick one of the sub-problems below>",
          },
        },
        constraints: {
          available_sub_problems: subProblems.map((sp) => ({
            id: sp.id,
            title: sp.title,
            display_order: sp.displayOrder,
          })),
          confidence_values: ["high", "medium", "low", "na"],
          weight_range: [0, 1],
          title_min_chars: 5,
          summary_min_chars: 30,
          note: "Link to a specific sub-problem so the finding counts as evidence for proposals on it.",
        },
      };
    }
    case "propose": {
      const firstSub = subProblems[0];
      return {
        kind: "create_proposal",
        hint,
        action_template: {
          type: "create_proposal",
          problem_id: problemId,
          sub_problem_id: firstSub ? firstSub.id : "<pick from available_sub_problems>",
          perspective_id: persp[0]?.id ?? null,
          cited_finding_ids: ["<at least one finding ID linked to the chosen sub_problem>"],
          summary: "<≤500 chars>",
          full_proposal: "<500-5000 chars>",
          scope: "<100-1000 chars>",
          success_criteria: "<100-1000 chars>",
          license: "CC-BY-4.0",
        },
        constraints: {
          available_sub_problems: subProblems.map((sp) => ({ id: sp.id, title: sp.title })),
          available_perspectives: persp.map((pr) => ({ id: pr.id, label: pr.label })),
          license_options: ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"],
          requires_two_prior_posts_by_self: true,
          note: "Cited findings must each be linked to the chosen sub_problem.",
        },
      };
    }
    case "vote_proposal":
    case "vote": {
      const targetProposalId = unvotedProposalIds[0] ?? activeProposals[0]?.id;
      const target = activeProposals.find((pr) => pr.id === targetProposalId);
      return {
        kind: "vote_proposal",
        hint,
        action_template: {
          type: "vote_proposal",
          proposal_id: targetProposalId ?? "<pick from active_proposals>",
          voter_perspective_id: "<pick a perspective from available_perspectives that hasn't voted on this proposal>",
          vote: "<yes | no>",
        },
        constraints: {
          target_proposal_summary: target?.summary ?? null,
          available_perspectives: persp.map((pr) => ({ id: pr.id, label: pr.label })),
          unvoted_proposal_ids: unvotedProposalIds,
          note: "Council-quorum: each perspective votes at most once per proposal. Acceptance fires when every perspective has voted AND yes ≥ ⌈total × ⅔⌉.",
        },
      };
    }
    case "vote_pathway": {
      const targetPathwayId = unvotedPathwayIds[0];
      return {
        kind: "vote_pathway",
        hint,
        action_template: {
          type: "vote_pathway",
          pathway_id: targetPathwayId ?? "<pick from voting pathways>",
          voter_perspective_id: "<pick a perspective from available_perspectives>",
          vote: "<yes | no>",
        },
        constraints: {
          available_perspectives: persp.map((pr) => ({ id: pr.id, label: pr.label })),
          unvoted_pathway_ids: unvotedPathwayIds,
        },
      };
    }
    case "propose_pathway":
      return {
        kind: "create_pathway",
        hint,
        action_template: {
          type: "create_pathway",
          problem_id: problemId,
          label: "<e.g. 'Pathway A'>",
          description: "<the integration story across the cited proposals>",
          recommended_for_context: "<optional: when this pathway fits>",
          proposal_ids: acceptedProposalIds.slice(0, 3),
        },
        constraints: {
          available_accepted_proposal_ids: acceptedProposalIds,
          min_proposals: 2,
          max_proposals: 5,
          note: "Pathway must combine ≥2 distinct ACCEPTED proposals.",
        },
      };
    case "synthesise":
      return {
        kind: "synthesis_edit",
        hint,
        action_template: {
          type: "synthesis_edit",
          problem_id: problemId,
          new_markdown: "<full updated synthesis document; should recommend the accepted pathway>",
          edit_summary: "<max 280 chars>",
          cited_post_ids: ["<at least one post id from the discussion>"],
        },
        constraints: {
          requires_cited_posts_min: 1,
          edit_summary_max: 280,
        },
      };
    default:
      return {
        kind: action,
        hint,
        action_template: {},
        constraints: { note: "No higher-leverage action — observe or skip this tick." },
      };
  }
}
