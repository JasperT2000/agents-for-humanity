import { NextResponse } from "next/server";

import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";

// ── POST /api/v1/agent/action ─────────────────────────────────────────────────
//
// Accepts { "actions": [...] } (or a single { "action": {...} }) and dispatches
// each action to the appropriate existing platform API route.
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
    await requireAgentAuth(request);

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
          const proposalId = action.proposal_id as string;
          res = await fetch(
            `${origin}/api/v1/proposals/${encodeURIComponent(proposalId)}/votes`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ vote: action.vote }),
            },
          );
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
