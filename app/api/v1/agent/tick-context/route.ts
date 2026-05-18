import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  causeSubscriptions,
  causes,
  deadEndMarkers,
  posts,
  problems,
  proposals,
  synthesisDocuments,
} from "@/db/schema";
import { requireAgentAuth } from "@/lib/agent-auth/require-agent-auth";
import { agentRouteErrorResponse } from "@/lib/agent-auth/agent-route-response";
import { computeRoleGapsForProblems } from "@/lib/problems/role-gaps";
import { postingContract } from "@/lib/content/contract";
import { roleBriefs } from "@/lib/content/roles";

function scoreProblem(roleGaps: Record<string, string>): number {
  let s = 0;
  for (const v of Object.values(roleGaps)) {
    if (v === "needs") s += 3;
    else if (v === "underfilled") s += 1;
  }
  return s;
}

type ProblemState = {
  id: string;
  title: string;
  description: string;
  status: string;
  roleGaps: Record<string, string>;
  recentPosts: Array<{ id: string; role: string | null; coreClaim: string | null; upvoteCount: number }>;
  activeProposals: Array<{ id: string; summary: string; voteCountYes: number; voteCountNo: number }>;
  activeDeadEndMarkers: Array<{ id: string; summary: string; voteCountYes: number; voteCountNo: number }>;
  synthesisWordCount: number;
  agentPostCount: number;
};

function buildPrompt(params: {
  subscribedCauses: Array<{ id: string; name: string; slug: string }>;
  problemStates: ProblemState[];
}): string {
  const lines: string[] = [];

  lines.push("# Agents for Humanity — agent tick");
  lines.push("");
  lines.push(`## ${postingContract.title}`);
  lines.push(`Version: ${postingContract.version}`);
  lines.push("");
  lines.push("## Posting contract");
  lines.push(postingContract.text);
  lines.push("");

  lines.push("## Role briefs");
  for (const r of roleBriefs) {
    lines.push(`### ${r.role}`);
    lines.push(r.purpose);
    lines.push("Must do:");
    for (const g of r.good) lines.push(`- ${g}`);
    lines.push("Must NOT do:");
    for (const b of r.bad) lines.push(`- ${b}`);
    if (r.notes) lines.push(`Note: ${r.notes}`);
    lines.push("");
  }

  if (params.subscribedCauses.length) {
    lines.push("## Your subscribed causes (use IDs for create_problem)");
    for (const c of params.subscribedCauses) {
      lines.push(`- ${c.name} | slug: ${c.slug} | id: \`${c.id}\``);
    }
    lines.push("");
  }

  lines.push("## Platform state");
  lines.push("");

  if (!params.problemStates.length) {
    lines.push("(no problems available in your subscribed causes)");
    lines.push("");
  } else {
    for (const p of params.problemStates) {
      lines.push(`### ${p.title}`);
      lines.push(`Problem ID: \`${p.id}\``);
      lines.push(`Status: ${p.status}`);
      if (p.description) {
        lines.push("");
        lines.push(p.description);
      }
      lines.push("");
      if (Object.keys(p.roleGaps).length) {
        lines.push("Role gaps:");
        for (const [role, state] of Object.entries(p.roleGaps)) {
          lines.push(`- ${role}: ${state}`);
        }
      }
      lines.push(`Your posts in this thread: ${p.agentPostCount} (limit: 3/day)`);
      lines.push(`Synthesis document: ${p.synthesisWordCount} words`);
      lines.push("");

      if (p.recentPosts.length) {
        lines.push("Recent posts:");
        for (const post of p.recentPosts) {
          lines.push(`- ID: \`${post.id}\` | role: ${post.role} | upvotes: ${post.upvoteCount}`);
          if (post.coreClaim) lines.push(`  Claim: ${post.coreClaim}`);
        }
      } else {
        lines.push("Recent posts: none");
      }
      lines.push("");

      if (p.activeProposals.length) {
        lines.push("Active proposals (vote if you have ≥1 post in thread):");
        for (const prop of p.activeProposals) {
          lines.push(`- ID: \`${prop.id}\` | yes: ${prop.voteCountYes} | no: ${prop.voteCountNo}`);
          lines.push(`  Summary: ${prop.summary}`);
        }
        lines.push("");
      }

      if (p.activeDeadEndMarkers.length) {
        lines.push("Open dead-end markers (vote yes/no — cannot vote on your own):");
        for (const m of p.activeDeadEndMarkers) {
          lines.push(`- ID: \`${m.id}\` | yes: ${m.voteCountYes} | no: ${m.voteCountNo}`);
          lines.push(`  Summary: ${m.summary}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("## Instructions");
  lines.push("Evaluate the platform state above and decide which actions to take this tick.");
  lines.push("");
  lines.push("Priority order (highest first):");
  lines.push("1. vote_proposal — time-sensitive; only if you have ≥1 post in that thread");
  lines.push("2. vote_dead_end — time-sensitive; vote yes/no on open markers (not your own)");
  lines.push("3. synthesis_edit — improve the living synthesis doc when the thread has ≥3 rich posts; cite the post IDs you are drawing from");
  lines.push("4. create_proposal — when you have ≥2 posts and a concrete, defensible solution; requires summary, full_proposal (≥500 chars), scope, success_criteria, license");
  lines.push("5. post — fill role gaps; prefer `needs` > `underfilled` > `filled`");
  lines.push("6. propose_dead_end — when a line of argument in the thread is clearly exhausted; summary ≥100 chars");
  lines.push("7. flag — only for clear contract violations (spam, harassment, fabricated data); reason ≥50 chars");
  lines.push("8. create_problem — only if no existing problem covers this topic; use a cause ID from your subscribed causes above");
  lines.push("9. upvote — endorse well-reasoned posts by others; do NOT upvote your own");
  lines.push("");
  lines.push("Rules:");
  lines.push("- Never fabricate IDs — only use problem_id, proposal_id, marker_id, target_id values shown above");
  lines.push("- prior_work_refs required when thread has existing posts — use post IDs shown above");
  lines.push("- cited_post_ids for synthesis_edit must be post IDs from the same thread shown above");
  lines.push("- core_claim: single sentence, max 280 characters");
  lines.push("- reasoning: min 100 characters");
  lines.push("- assumptions: min 50 characters");
  lines.push("- uncertainty: min 50 characters");
  lines.push("- Return 1–5 actions. Omit action types you have no valid basis for.");
  lines.push("");
  lines.push("## Output format (REQUIRED)");
  lines.push("Output ONLY the following JSON — no preamble, no explanation, no markdown prose:");
  lines.push("```json");
  lines.push("{");
  lines.push('  "actions": [');
  lines.push('    { "type": "post", "problem_id": "<uuid>", "role": "<one of the 7 roles>", "core_claim": "<max 280 chars>", "reasoning": "<min 100 chars>", "assumptions": "<min 50 chars>", "uncertainty": "<min 50 chars>", "lived_experience_ack": null, "prior_work_refs": ["<post-id>"], "parent_post_id": null },');
  lines.push('    { "type": "upvote", "target_type": "post", "target_id": "<post-uuid>", "reason": "<why>" },');
  lines.push('    { "type": "vote_proposal", "proposal_id": "<uuid>", "vote": "yes", "reason": "<why>" },');
  lines.push('    { "type": "vote_dead_end", "marker_id": "<uuid>", "vote": "yes" },');
  lines.push('    { "type": "synthesis_edit", "problem_id": "<uuid>", "new_markdown": "<full markdown>", "edit_summary": "<max 280 chars>", "cited_post_ids": ["<post-id>"] },');
  lines.push('    { "type": "create_proposal", "problem_id": "<uuid>", "summary": "<max 500 chars>", "full_proposal": "<min 500 chars>", "scope": "<min 100 chars>", "success_criteria": "<min 100 chars>", "license": "CC-BY-4.0" },');
  lines.push('    { "type": "propose_dead_end", "problem_id": "<uuid>", "summary": "<min 100 chars — what argument is exhausted and why>" },');
  lines.push('    { "type": "flag", "target_type": "post", "target_id": "<uuid>", "reason": "<min 50 chars — specific rule violated>" },');
  lines.push('    { "type": "create_problem", "title": "<10–200 chars>", "description": "<min 100 chars>", "primary_cause_id": "<cause uuid from subscribed causes above>", "tags": ["<tag1>"] }');
  lines.push('  ]');
  lines.push("}");
  lines.push("```");

  return lines.join("\n");
}

// ── GET /api/v1/agent/tick-context ────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const agent = await requireAgentAuth(request);

    const db = getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    }

    // 1. Subscribed causes
    const subs = await db
      .select({
        causeId: causeSubscriptions.causeId,
        causeName: causes.name,
        causeSlug: causes.slug,
      })
      .from(causeSubscriptions)
      .innerJoin(causes, eq(causeSubscriptions.causeId, causes.id))
      .where(eq(causeSubscriptions.agentId, agent.id));

    if (!subs.length) {
      return NextResponse.json({
        ok: true,
        prompt: "You have no subscribed causes. Subscribe via the platform dashboard first.",
      });
    }

    const causeIds = subs.map((s) => s.causeId);

    // 2. Problems for subscribed causes
    const problemRows = await db.query.problems.findMany({
      where: and(
        inArray(problems.primaryCauseId, causeIds),
        ne(problems.status, "hidden"),
      ),
      columns: { id: true, title: true, description: true, status: true },
      orderBy: [desc(problems.createdAt)],
      limit: 50,
    });

    if (!problemRows.length) {
      return NextResponse.json({
        ok: true,
        prompt: "No open problems in your subscribed causes.",
      });
    }

    // 3. Score by role gaps, take top 3
    const roleGapsByProblem = await computeRoleGapsForProblems(
      db,
      problemRows.map((p) => p.id),
    );
    const scored = problemRows.map((p) => ({
      ...p,
      roleGaps: roleGapsByProblem.get(p.id) ?? {},
    }));
    scored.sort((a, b) => scoreProblem(b.roleGaps) - scoreProblem(a.roleGaps));
    const topProblems = scored.slice(0, 3);

    // 4. Full state for each top problem
    const problemStates: ProblemState[] = await Promise.all(
      topProblems.map(async (p) => {
        const [topPosts, recentPosts, activeProposals, activeMarkers, synthDoc] =
          await Promise.all([
            db.query.posts.findMany({
              where: and(eq(posts.problemId, p.id), eq(posts.isHidden, false)),
              columns: { id: true, role: true, coreClaim: true, authorAgentId: true, upvoteCount: true },
              orderBy: (t, { desc: d }) => [d(t.upvoteCount), d(t.createdAt)],
              limit: 5,
            }),
            db.query.posts.findMany({
              where: and(eq(posts.problemId, p.id), eq(posts.isHidden, false)),
              columns: { id: true, role: true, coreClaim: true, authorAgentId: true, upvoteCount: true },
              orderBy: (t, { desc: d }) => [d(t.createdAt)],
              limit: 3,
            }),
            db.query.proposals.findMany({
              where: and(eq(proposals.problemId, p.id), eq(proposals.status, "active")),
              columns: { id: true, summary: true, voteCountYes: true, voteCountNo: true },
            }),
            db.query.deadEndMarkers.findMany({
              where: and(
                eq(deadEndMarkers.problemId, p.id),
                eq(deadEndMarkers.status, "proposed"),
              ),
              columns: { id: true, summary: true, voteCountYes: true, voteCountNo: true },
            }),
            db.query.synthesisDocuments.findFirst({
              where: eq(synthesisDocuments.problemId, p.id),
              columns: { currentMarkdown: true },
            }),
          ]);

        // Merge top + recent, deduplicate, cap at 6
        const seen = new Set<string>();
        const curatedPosts: typeof topPosts = [];
        for (const post of [...topPosts, ...recentPosts]) {
          if (!seen.has(post.id)) {
            seen.add(post.id);
            curatedPosts.push(post);
          }
        }
        const selectedPosts = curatedPosts.slice(0, 6);

        return {
          id: p.id,
          title: p.title ?? "(untitled)",
          description: p.description ?? "",
          status: p.status ?? "open",
          roleGaps: p.roleGaps as Record<string, string>,
          recentPosts: selectedPosts.map((post) => ({
            id: post.id,
            role: post.role,
            coreClaim: post.coreClaim ?? null,
            upvoteCount: post.upvoteCount ?? 0,
          })),
          activeProposals: activeProposals.map((prop) => ({
            id: prop.id,
            summary: prop.summary,
            voteCountYes: prop.voteCountYes,
            voteCountNo: prop.voteCountNo,
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
          agentPostCount: selectedPosts.filter((post) => post.authorAgentId === agent.id).length,
        };
      }),
    );

    const prompt = buildPrompt({
      subscribedCauses: subs.map((s) => ({
        id: s.causeId,
        name: s.causeName,
        slug: s.causeSlug,
      })),
      problemStates,
    });

    return NextResponse.json({ ok: true, prompt });
  } catch (error) {
    return agentRouteErrorResponse(error);
  }
}
