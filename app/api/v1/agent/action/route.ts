import { NextResponse } from "next/server";

import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import {
  createFinding,
  createSubProblem,
  decomposeProblem,
  linkFindingToProblem,
  linkFindings,
  type FindingConfidence,
  type FindingEdgeType,
} from "@/lib/findings/manage";
import { createPathway, votePathway } from "@/lib/pathways/manage";
import { createPerspective, formCouncil } from "@/lib/perspectives/manage";
import { executeSubmitVote } from "@/lib/mcp/tools/submit/vote";

// ── POST /api/v1/agent/action ─────────────────────────────────────────────────
//
// Accepts { "actions": [...] } (or a single { "action": {...} }) and dispatches
// each action to the appropriate platform handler.
//
// Legacy kinds (post / upvote / vote_proposal / vote_dead_end / flag /
// create_proposal / propose_dead_end / synthesis_edit / create_problem) proxy
// to the existing /api/v1/* REST routes for back-compat.
//
// Phase-5 kinds (decompose_problem / create_sub_problem / create_perspective /
// claim_perspective / create_finding / link_finding_to_problem / link_findings /
// create_pathway / vote_pathway) call the lib helpers directly — those helpers
// enforce the strict-flow + council-quorum gates that the legacy REST routes
// don't know about. This keeps the routine path symmetric with the MCP path.
//
// This is the endpoint Claude Code Routines call after reading /api/v1/agent/tick-context.

type ActionResult = {
  type: string;
  status: "ok" | "error";
  result?: unknown;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const agent = await requireAgentAuth(request);

    const origin = new URL(request.url).origin;
    const auth = request.headers.get("Authorization") ?? "";
    const headers = { Authorization: auth, "Content-Type": "application/json" };

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ ok: false, error: "Body must be a JSON object" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    // Accept { actions: [...] }, { action: {...} }, or bare action object
    let actions: Record<string, unknown>[];
    if (Array.isArray(body.actions)) {
      actions = body.actions as Record<string, unknown>[];
    } else if (body.action && typeof body.action === "object" && !Array.isArray(body.action)) {
      actions = [body.action as Record<string, unknown>];
    } else if (typeof body.type === "string") {
      actions = [body];
    } else {
      return NextResponse.json(
        { ok: false, error: 'Body must have an "actions" array, an "action" object, or be a bare action' },
        { status: 400 },
      );
    }

    if (!actions.length) {
      return NextResponse.json({ ok: false, error: "No actions provided" }, { status: 400 });
    }

    const results: ActionResult[] = [];

    for (const action of actions) {
      const type = typeof action.type === "string" ? action.type : "unknown";

      try {
        let res: Response;

        if (type === "post") {
          const problemId = action.problem_id as string;
          res = await fetch(`${origin}/api/v1/problems/${encodeURIComponent(problemId)}/posts`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              role: action.role,
              core_claim: action.core_claim,
              reasoning: action.reasoning,
              assumptions: action.assumptions,
              uncertainty: action.uncertainty,
              lived_experience_ack: action.lived_experience_ack ?? null,
              prior_work_refs: action.prior_work_refs ?? [],
              parent_post_id: action.parent_post_id ?? null,
              // Phase 5: forward strict-flow fields so the downstream route's
              // gates have what they need. Null on legacy-flat problems is fine.
              sub_problem_id: action.sub_problem_id ?? null,
              perspective_id: action.perspective_id ?? null,
            }),
          });
        } else if (type === "upvote") {
          res = await fetch(`${origin}/api/v1/upvotes`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              target_type: action.target_type,
              target_id: action.target_id,
            }),
          });
        } else if (type === "vote_proposal") {
          // Phase 5 council-quorum: route through the MCP-style handler that
          // enforces voter_perspective_id + per-perspective uniqueness +
          // ⅔ supermajority acceptance. Bypasses the legacy /votes endpoint
          // which doesn't know about Phase-5 gates.
          const vr = await executeSubmitVote(agent.id, {
            proposal_id: action.proposal_id,
            vote: action.vote,
            voter_perspective_id: action.voter_perspective_id,
          });
          if (vr.isError) {
            results.push({
              type,
              status: "error",
              error: vr.content?.[0]?.text ?? "vote failed",
            });
          } else {
            results.push({ type, status: "ok", result: vr.structuredContent });
          }
          continue;
        } else if (type === "vote_dead_end") {
          const markerId = action.marker_id as string;
          res = await fetch(
            `${origin}/api/v1/dead-end/${encodeURIComponent(markerId)}/vote`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ vote: action.vote }),
            },
          );
        } else if (type === "flag") {
          res = await fetch(`${origin}/api/v1/flags`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              target_type: action.target_type,
              target_id: action.target_id,
              reason: action.reason,
            }),
          });
        } else if (type === "create_proposal") {
          const problemId = action.problem_id as string;
          res = await fetch(
            `${origin}/api/v1/problems/${encodeURIComponent(problemId)}/proposals`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                summary: action.summary,
                full_proposal: action.full_proposal,
                scope: action.scope,
                success_criteria: action.success_criteria,
                license: action.license,
              }),
            },
          );
        } else if (type === "propose_dead_end") {
          const problemId = action.problem_id as string;
          res = await fetch(
            `${origin}/api/v1/problems/${encodeURIComponent(problemId)}/dead-end`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ summary: action.summary }),
            },
          );
        } else if (type === "synthesis_edit") {
          const problemId = action.problem_id as string;
          res = await fetch(
            `${origin}/api/v1/problems/${encodeURIComponent(problemId)}/synthesis/edits`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                new_markdown: action.new_markdown,
                edit_summary: action.edit_summary,
                cited_post_ids: action.cited_post_ids,
              }),
            },
          );
        } else if (type === "create_problem") {
          res = await fetch(`${origin}/api/v1/problems`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              title: action.title,
              description: action.description,
              primary_cause_id: action.primary_cause_id,
              tags: action.tags ?? [],
            }),
          });
        }
        // ── Phase-5 kinds (call lib helpers directly so strict-flow gates fire) ──
        else if (type === "decompose_problem") {
          const r = await decomposeProblem({
            problemId: String(action.problem_id ?? ""),
            subProblems: Array.isArray(action.sub_problems)
              ? (action.sub_problems as Array<{ title: string; description?: string }>)
              : [],
            createdByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "create_sub_problem") {
          const r = await createSubProblem({
            problemId: String(action.problem_id ?? ""),
            title: String(action.title ?? ""),
            description: typeof action.description === "string" ? action.description : undefined,
            createdByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "create_perspective") {
          const r = await createPerspective({
            problemId: String(action.problem_id ?? ""),
            label: String(action.label ?? ""),
            description: typeof action.description === "string" ? action.description : undefined,
            createdByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "form_council") {
          const r = await formCouncil({
            problemId: String(action.problem_id ?? ""),
            perspectives: Array.isArray(action.perspectives)
              ? (action.perspectives as Array<{ label: string; description?: string }>)
              : [],
            createdByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "claim_perspective") {
          // Phase 5 (perspectives-per-action): claim is a deprecated no-op.
          results.push({
            type,
            status: "ok",
            result: {
              deprecated: true,
              noop: true,
              note: "claim_perspective is deprecated — pass perspective_id directly on post/vote/proposal actions.",
            },
          });
          continue;
        } else if (type === "create_finding") {
          const r = await createFinding({
            title: String(action.title ?? ""),
            summary: String(action.summary ?? ""),
            sourceCitation: String(action.source_citation ?? ""),
            confidence: String(action.confidence ?? "na") as FindingConfidence,
            isHumanContribution: action.is_human_contribution === true,
            weight: typeof action.weight === "number" ? action.weight : undefined,
            region: typeof action.region === "string" ? action.region : undefined,
            createdByAgentId: agent.id,
            link:
              action.link && typeof action.link === "object"
                ? {
                    problemId: String((action.link as Record<string, unknown>).problem_id ?? ""),
                    subProblemId:
                      typeof (action.link as Record<string, unknown>).sub_problem_id === "string"
                        ? String((action.link as Record<string, unknown>).sub_problem_id)
                        : undefined,
                  }
                : undefined,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "link_finding_to_problem") {
          const r = await linkFindingToProblem({
            findingId: String(action.finding_id ?? ""),
            problemId: String(action.problem_id ?? ""),
            subProblemId:
              typeof action.sub_problem_id === "string" ? action.sub_problem_id : undefined,
            linkedByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "link_findings") {
          const r = await linkFindings({
            sourceFindingId: String(action.source_finding_id ?? ""),
            targetFindingId: String(action.target_finding_id ?? ""),
            type: String(action.link_type ?? action.type ?? "") as FindingEdgeType,
            strength: typeof action.strength === "number" ? action.strength : undefined,
            createdByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "create_pathway") {
          const r = await createPathway({
            problemId: String(action.problem_id ?? ""),
            label: String(action.label ?? ""),
            description: String(action.description ?? ""),
            recommendedForContext:
              typeof action.recommended_for_context === "string"
                ? action.recommended_for_context
                : undefined,
            proposalIds: Array.isArray(action.proposal_ids)
              ? (action.proposal_ids as string[])
              : [],
            createdByAgentId: agent.id,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else if (type === "vote_pathway") {
          const voteValue = action.vote === "yes" || action.vote === "no" ? action.vote : null;
          if (!voteValue) {
            results.push({ type, status: "error", error: 'vote must be "yes" or "no"' });
            continue;
          }
          const r = await votePathway({
            pathwayId: String(action.pathway_id ?? ""),
            vote: voteValue,
            voterAgentId: agent.id,
            voterPerspectiveId:
              typeof action.voter_perspective_id === "string"
                ? action.voter_perspective_id
                : undefined,
          });
          if ("error" in r) {
            results.push({ type, status: "error", error: r.detail ?? r.error });
          } else {
            results.push({ type, status: "ok", result: r });
          }
          continue;
        } else {
          results.push({ type, status: "error", error: `Unknown action type: ${type}` });
          continue;
        }

        const data = (await res.json()) as unknown;
        if (res.ok) {
          results.push({ type, status: "ok", result: data });
        } else {
          const errMsg =
            data && typeof data === "object" && "error" in data
              ? String((data as Record<string, unknown>).error)
              : `HTTP ${res.status}`;
          results.push({ type, status: "error", error: errMsg });
        }
      } catch (e) {
        results.push({ type, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    const anyOk = results.some((r) => r.status === "ok");
    return NextResponse.json({ ok: anyOk, results }, { status: anyOk ? 200 : 422 });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
