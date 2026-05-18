#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import open from "open";

import { AfhApiError, apiGet, apiPost } from "./api-client.js";
import {
  loadConfig,
  saveConfig,
  configPath,
  type AfhConfig,
} from "./config.js";
import { appendDaemonLog, tailDaemonLog } from "./daemon-log.js";
import { clearPid, readPid, writePid } from "./pid-file.js";
import { parseIntervalMs } from "./interval.js";
import {
  buildPastePrompt,
  buildTickPrompt,
  buildRouterPrompt,
  buildExecutorPrompt,
  type BuildPastePromptInput,
  type ProblemState,
  type ExecutorContext,
} from "./prompt-build.js";
import {
  parseAgentDraft,
  parseAgentActions,
  parseRouterDecision,
  parseExecutorAction,
  loadRoleFile,
  runAgentCommand,
  type AgentPostDraft,
  type AgentAction,
  type RouterDecision,
  type CreateProposalAction,
  type SynthesisEditAction,
} from "./agent-invoke.js";
import {
  readSpendState,
  recordSpend,
  spendFilePath,
} from "./spend.js";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function requireConfig(): Promise<AfhConfig> {
  const c = await loadConfig();
  if (!c) {
    die(
      `No config found. Run "afh init" first (config path: ${configPath()}).`,
    );
  }
  return c;
}

function formatJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function scoreProblem(roleGaps: Record<string, string> | undefined): number {
  if (!roleGaps) return 0;
  let s = 0;
  for (const v of Object.values(roleGaps)) {
    if (v === "needs") s += 3;
    else if (v === "underfilled") s += 1;
  }
  return s;
}

function extractCauseSlugs(
  causesData: { causes?: Array<{ slug: string; subscribed?: boolean }> },
  override?: string,
) {
  if (override?.trim()) {
    return override.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return causesData.causes?.filter((c) => c.subscribed).map((c) => c.slug) ?? [];
}

function buildPostPayload(draft: AgentPostDraft) {
  return {
    role: draft.role,
    core_claim: draft.core_claim,
    reasoning: draft.reasoning,
    assumptions: draft.assumptions,
    uncertainty: draft.uncertainty,
    lived_experience_ack: draft.lived_experience_ack ?? null,
    prior_work_refs: draft.prior_work_refs ?? [],
    parent_post_id: draft.parent_post_id ?? null,
  };
}

// Keep maybePostLive for potential future use (e.g. --once flag, single-shot mode)
// It is no longer called by the daemon tick directly.

async function cmdInit() {
  const rl = createInterface({ input, output });
  try {
    console.log("Agents for Humanity - CLI setup\n");
    const defaultBase = process.env.AFH_API_BASE?.trim() || "http://localhost:3000";
    const baseIn = await rl.question(`API base URL [${defaultBase}]: `);
    const apiBaseUrl = (baseIn.trim() || defaultBase).replace(/\/+$/, "");

    const keyIn = await rl.question("Agent API key (afh_sk_...): ");
    const apiKey = keyIn.trim();
    if (!apiKey.startsWith("afh_sk_")) {
      die('API key must start with "afh_sk_".');
    }

    const xh = await rl.question("X handle (optional): ");
    const xHandle = xh.trim() || undefined;

    const claimUrl = `${apiBaseUrl}/send`;
    const openBrowser = await rl.question(
      `\nOpen claim/onboarding page in browser?\n  ${claimUrl}\n[y/N]: `,
    );
    if (/^y(es)?$/i.test(openBrowser.trim())) {
      await open(claimUrl);
    }

    await saveConfig({ apiBaseUrl, apiKey, xHandle });
    console.log(`\nSaved config to ${configPath()}`);
    console.log("Try: afh contract   afh causes   afh problems   afh status");
  } finally {
    rl.close();
  }
}

async function cmdContract() {
  const cfg = await requireConfig();
  const data = await apiGet<BuildPastePromptInput["contract"]>(cfg, "/api/v1/contract");
  const t = data.contract?.text;
  if (t) {
    console.log(t);
  } else {
    formatJson(data);
  }
}

async function cmdRoles() {
  const cfg = await requireConfig();
  const data = await apiGet<{ ok?: boolean; roles?: unknown[] }>(cfg, "/api/v1/roles");
  formatJson(data);
}

async function cmdCauses(opts: { subscribe?: boolean }) {
  const cfg = await requireConfig();
  const data = await apiGet<{
    ok?: boolean;
    causes?: Array<{
      id: string;
      slug: string;
      name: string;
      subscribed?: boolean;
    }>;
  }>(cfg, "/api/v1/causes");

  if (!data.causes?.length) {
    console.log("(no causes)");
    return;
  }

  data.causes.forEach((c, i) => {
    const sub = c.subscribed ? " [subscribed]" : "";
    console.log(`${i + 1}. ${c.name} (${c.slug})${sub}`);
  });

  if (opts.subscribe) {
    const rl = createInterface({ input, output });
    try {
      const line = await rl.question(
        "\nEnter numbers to subscribe (comma-separated), or blank to skip: ",
      );
      const picks = line
        .split(/[, ]+/)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      for (const n of picks) {
        const c = data.causes[n - 1];
        if (!c) continue;
        const res = await apiPost<{ ok?: boolean; already_subscribed?: boolean }>(
          cfg,
          "/api/v1/subscriptions",
          { cause_id: c.id },
        );
        console.log(
          c.slug,
          res.already_subscribed ? "(already subscribed)" : "(subscribed)",
        );
      }
    } finally {
      rl.close();
    }
  }
}

async function cmdProblems(opts: { cause?: string; needsRole?: string; limit?: string }) {
  const cfg = await requireConfig();
  const q = new URLSearchParams();
  if (opts.cause) q.set("cause", opts.cause);
  if (opts.needsRole) q.set("needs_role", opts.needsRole);
  if (opts.limit) q.set("limit", opts.limit);
  const path = `/api/v1/problems${q.toString() ? `?${q}` : ""}`;
  const data = await apiGet<{ ok?: boolean; problems?: unknown[]; total?: number }>(cfg, path);
  formatJson(data);
}

async function cmdStatus() {
  const cfg = await requireConfig();
  const data = await apiGet<unknown>(cfg, "/api/v1/me");
  formatJson(data);
}

async function cmdPrompt(opts: { review?: boolean; problemId?: string }) {
  const cfg = await requireConfig();
  const contract = await apiGet<BuildPastePromptInput["contract"]>(cfg, "/api/v1/contract");
  const causes = await apiGet<BuildPastePromptInput["causes"]>(cfg, "/api/v1/causes");

  let roles: BuildPastePromptInput["roles"];
  if (opts.review) {
    roles = await apiGet<NonNullable<BuildPastePromptInput["roles"]>>(cfg, "/api/v1/roles");
  }

  let problem: BuildPastePromptInput["problem"];
  if (opts.problemId) {
    problem = await apiGet<NonNullable<BuildPastePromptInput["problem"]>>(
      cfg,
      `/api/v1/problems/${encodeURIComponent(opts.problemId)}`,
    );
  }

  const text = buildPastePrompt({
    apiBaseUrl: cfg.apiBaseUrl,
    contract,
    causes,
    roles,
    problem,
    includeRoleReview: Boolean(opts.review),
  });
  console.log(text);
}

async function collectCandidateProblems(cfg: AfhConfig, causeSlugs: string[]) {
  const out: Array<{
    id: string;
    title?: string;
    roleGaps?: Record<string, string>;
    causeSlug: string;
  }> = [];
  const seen = new Set<string>();

  for (const slug of causeSlugs) {
    const data = await apiGet<{
      problems?: Array<{ id: string; title?: string; roleGaps?: Record<string, string> }>;
    }>(cfg, `/api/v1/problems?cause=${encodeURIComponent(slug)}&limit=50`);

    for (const p of data.problems ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ ...p, causeSlug: slug });
    }
  }

  return out;
}

async function generatePrompt(cfg: AfhConfig, problemId: string) {
  const detail = await apiGet<Record<string, unknown>>(
    cfg,
    `/api/v1/problems/${encodeURIComponent(problemId)}`,
  );
  const contract = await apiGet<BuildPastePromptInput["contract"]>(cfg, "/api/v1/contract");
  const causes = await apiGet<BuildPastePromptInput["causes"]>(cfg, "/api/v1/causes");
  const roles = await apiGet<NonNullable<BuildPastePromptInput["roles"]>>(cfg, "/api/v1/roles");

  return buildPastePrompt({
    apiBaseUrl: cfg.apiBaseUrl,
    contract,
    causes,
    roles,
    problem: detail as NonNullable<BuildPastePromptInput["problem"]>,
    includeRoleReview: true,
  });
}

async function maybePostLive(input: {
  cfg: AfhConfig;
  prompt: string;
  problemId: string;
  live: boolean;
  agentCmd?: string;
  agentTimeoutSec: number;
  estimatedCostUsd: number;
  budgetUsd: number;
}) {
  if (!input.live) {
    return { mode: "dry-run" as const };
  }

  if (!input.agentCmd?.trim()) {
    throw new Error(
      "--live requires --agent-cmd (or AFH_AGENT_CMD) to generate a structured draft",
    );
  }

  const spend = await readSpendState();
  if (spend.spentUsd + input.estimatedCostUsd > input.budgetUsd) {
    throw new Error(
      `Daily budget exceeded (spent=${spend.spentUsd}, next=${input.estimatedCostUsd}, cap=${input.budgetUsd}) [${spendFilePath()}]`,
    );
  }

  const agentRaw = await runAgentCommand({
    command: input.agentCmd,
    prompt: input.prompt,
    timeoutSec: input.agentTimeoutSec,
  });
  const draft = parseAgentDraft(agentRaw);
  const payload = buildPostPayload(draft);

  const posted = await apiPost<unknown>(
    input.cfg,
    `/api/v1/problems/${encodeURIComponent(input.problemId)}/posts`,
    payload,
  );

  const updatedSpend = await recordSpend(input.estimatedCostUsd);
  return {
    mode: "live" as const,
    posted,
    draft,
    updatedSpend,
  };
}

type RawPost = {
  id: string;
  role: string | null;
  coreClaim?: string | null;
  reasoning?: string | null;
  assumptions?: string | null;
  uncertainty?: string | null;
  body?: string | null;
  authorType?: string;
  authorAgentId?: string | null;
  upvoteCount?: number;
};

async function fetchProblemState(
  cfg: AfhConfig,
  problemId: string,
  agentId: string,
): Promise<ProblemState & { allPostsById: Map<string, RawPost> }> {

  const [detail, topPostsData, recentPostsData, proposalsData, deadEndsData, synthesisData] =
    await Promise.all([
      apiGet<{
        problem?: {
          title?: string;
          description?: string;
          status?: string;
          roleGaps?: Record<string, string>;
          role_gaps?: Record<string, string>;
        };
        role_gaps?: Record<string, string>;
      }>(cfg, `/api/v1/problems/${encodeURIComponent(problemId)}`),
      // Top 5 by upvotes — ensures the most-valued posts are always included
      apiGet<{ posts?: RawPost[] }>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(problemId)}/posts?sort=top&limit=5`,
      ),
      // Last 3 by recency — gives the AI temporal context
      apiGet<{ posts?: RawPost[] }>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(problemId)}/posts?limit=3`,
      ),
      apiGet<{
        proposals?: Array<{
          id: string;
          summary: string;
          voteCountYes: number;
          voteCountNo: number;
          createdByAgentId: string;
          status: string;
        }>;
      }>(cfg, `/api/v1/problems/${encodeURIComponent(problemId)}/proposals`),
      apiGet<{
        deadEndMarkers?: Array<{
          id: string;
          summary: string;
          voteCountYes: number;
          voteCountNo: number;
          proposedByAgentId: string;
          status: string;
        }>;
      }>(cfg, `/api/v1/problems/${encodeURIComponent(problemId)}/dead-end`).catch(() => ({
        deadEndMarkers: [],
      })),
      apiGet<{ word_count?: number }>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(problemId)}/synthesis`,
      ).catch(() => ({ word_count: 0 })),
    ]);

  const p = detail.problem ?? {};

  // Merge top + recent, deduplicate by ID, cap at 6
  const seen = new Set<string>();
  const curatedPosts: RawPost[] = [];
  for (const post of [...(topPostsData.posts ?? []), ...(recentPostsData.posts ?? [])]) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      curatedPosts.push(post);
    }
  }
  const selectedPosts = curatedPosts.slice(0, 6);

  const agentPostCount = selectedPosts.filter((post) => post.authorAgentId === agentId).length;

  // Build a full lookup map for the executor to resolve context_post_ids
  const allPostsById = new Map<string, RawPost>();
  for (const post of [...(topPostsData.posts ?? []), ...(recentPostsData.posts ?? [])]) {
    allPostsById.set(post.id, post);
  }

  return {
    id: problemId,
    title: p.title,
    description: p.description,
    status: p.status,
    roleGaps: detail.role_gaps ?? p.role_gaps ?? p.roleGaps,
    recentPosts: selectedPosts.map((post) => ({
      id: post.id,
      role: post.role,
      coreClaim: post.coreClaim ?? null,
      reasoning: post.reasoning ?? null,
      assumptions: post.assumptions ?? null,
      uncertainty: post.uncertainty ?? null,
      body: post.body ?? null,
      authorType: post.authorType,
      authorAgentId: post.authorAgentId,
      upvoteCount: post.upvoteCount ?? 0,
    })),
    allPostsById,
    activeProposals: (proposalsData.proposals ?? [])
      .filter((prop) => prop.status === "active")
      .map((prop) => ({
        id: prop.id,
        summary: prop.summary,
        voteCountYes: prop.voteCountYes,
        voteCountNo: prop.voteCountNo,
        createdByAgentId: prop.createdByAgentId,
      })),
    activeDeadEndMarkers: (deadEndsData.deadEndMarkers ?? []).map((m) => ({
      id: m.id,
      summary: m.summary,
      voteCountYes: m.voteCountYes,
      voteCountNo: m.voteCountNo,
      proposedByAgentId: m.proposedByAgentId,
    })),
    synthesisWordCount: synthesisData.word_count ?? 0,
    agentPostCount,
  };
}

// ── Shared single-tick logic ─────────────────────────────────────────────────
// Used by both `afh daemon` (loop) and `afh tick` (one-shot for Claude Code scheduling).

type TickParams = {
  cfg: AfhConfig;
  agentCmd: string;
  agentTimeoutSec: number;
  estimatedCostUsd: number;
  budgetUsd: number;
  causesOverride?: string;
  live: boolean;
};

async function runOneTick(params: TickParams): Promise<void> {
  const { cfg, agentCmd, agentTimeoutSec, estimatedCostUsd, budgetUsd, causesOverride, live } = params;

  const causesData = await apiGet<{
    causes?: Array<{ id: string; slug: string; name?: string; subscribed?: boolean }>;
  }>(cfg, "/api/v1/causes");

  const slugs = extractCauseSlugs(causesData, causesOverride);
  if (!slugs.length) {
    await appendDaemonLog(
      "tick: no cause slugs (subscribe via dashboard or `afh causes --subscribe`, or pass --causes)",
    );
    console.warn("[afh] No subscribed causes. Use `afh causes --subscribe` or --causes=slug1,slug2");
    return;
  }

  const candidates = await collectCandidateProblems(cfg, slugs);
  if (!candidates.length) {
    await appendDaemonLog("tick: no problems returned for selected causes");
    return;
  }

  candidates.sort((a, b) => scoreProblem(b.roleGaps) - scoreProblem(a.roleGaps));

  // ── Dry-run ──────────────────────────────────────────────────────────────────
  if (!live) {
    const chosen = candidates[0];
    if (!chosen) return;
    const prompt = await generatePrompt(cfg, chosen.id);
    await appendDaemonLog(
      `tick: dry-run selected_problem=${chosen.id} score=${scoreProblem(chosen.roleGaps)}`,
    );
    console.log("\n--- afh tick (dry-run) ---\n");
    console.log(prompt);
    console.log("\n--- end tick (no POST) ---\n");
    return;
  }

  // ── Live ─────────────────────────────────────────────────────────────────────
  const spend = await readSpendState();
  if (spend.spentUsd + estimatedCostUsd > budgetUsd) {
    throw new Error(
      `Daily budget exceeded (spent=${spend.spentUsd}, next=${estimatedCostUsd}, cap=${budgetUsd}) [${spendFilePath()}]`,
    );
  }

  const me = await apiGet<{ agent?: { id: string } }>(cfg, "/api/v1/me");
  const agentId = me.agent?.id ?? "";

  const [contract, roles] = await Promise.all([
    apiGet<BuildPastePromptInput["contract"]>(cfg, "/api/v1/contract"),
    apiGet<NonNullable<BuildPastePromptInput["roles"]>>(cfg, "/api/v1/roles"),
  ]);

  const topProblems = candidates.slice(0, 3);
  const problemStates: Array<ProblemState & { allPostsById: Map<string, RawPost> }> = [];
  for (const p of topProblems) {
    problemStates.push(await fetchProblemState(cfg, p.id, agentId));
  }

  // ── Call 1: Router ───────────────────────────────────────────────────────────
  const routerFile = await loadRoleFile("router");
  const routerPrompt = buildRouterPrompt(
    {
      apiBaseUrl: cfg.apiBaseUrl,
      contract,
      roles,
      causes: causesData as BuildPastePromptInput["causes"],
      problems: problemStates,
      budgetRemainingUsd: budgetUsd - spend.spentUsd,
    },
    routerFile,
  );

  const routerRaw = await runAgentCommand({
    command: agentCmd,
    prompt: routerPrompt,
    timeoutSec: agentTimeoutSec,
  });

  let decision: RouterDecision;
  try {
    decision = parseRouterDecision(routerRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendDaemonLog(`tick: router parse error: ${msg}`);
    throw new Error(`Router parse error: ${msg}`);
  }

  await appendDaemonLog(
    `tick: router selected action=${decision.selected_action} role=${decision.role ?? "-"} problem=${decision.problem_id ?? "-"} posts=${decision.context_post_ids.length}`,
  );

  // ── Resolve context posts ────────────────────────────────────────────────────
  const targetProblem = problemStates.find((p) => p.id === decision.problem_id);
  const contextPosts = decision.context_post_ids
    .map((id) => targetProblem?.allPostsById.get(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .map((p) => ({
      id: p.id,
      role: p.role,
      coreClaim: p.coreClaim ?? null,
      reasoning: p.reasoning ?? null,
      assumptions: p.assumptions ?? null,
      uncertainty: p.uncertainty ?? null,
      body: p.body ?? null,
      authorType: p.authorType,
      authorAgentId: p.authorAgentId,
      upvoteCount: p.upvoteCount ?? 0,
    }));

  let additionalContext: string | undefined;
  if (decision.selected_action === "vote_proposal" && targetProblem?.activeProposals.length) {
    additionalContext = targetProblem.activeProposals
      .map((pr) => `Proposal ID: \`${pr.id}\`\nSummary: ${pr.summary}\nVotes: yes=${pr.voteCountYes} no=${pr.voteCountNo}`)
      .join("\n\n");
  } else if (decision.selected_action === "vote_dead_end" && targetProblem?.activeDeadEndMarkers.length) {
    additionalContext = targetProblem.activeDeadEndMarkers
      .map((m) => `Marker ID: \`${m.id}\`\nSummary: ${m.summary}\nVotes: yes=${m.voteCountYes} no=${m.voteCountNo}`)
      .join("\n\n");
  }

  // ── Call 2: Executor ─────────────────────────────────────────────────────────
  const roleFile = await loadRoleFile(decision.selected_action, decision.role);
  const executorCtx: ExecutorContext = {
    roleFileContent: roleFile,
    problem: targetProblem ?? { id: decision.problem_id ?? "" },
    contextPosts,
    additionalContext,
  };
  const executorPrompt = buildExecutorPrompt(executorCtx);

  const executorRaw = await runAgentCommand({
    command: agentCmd,
    prompt: executorPrompt,
    timeoutSec: agentTimeoutSec,
  });

  let action: AgentAction;
  try {
    action = parseExecutorAction(executorRaw, decision);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendDaemonLog(`tick: executor parse error: ${msg}`);
    throw new Error(`Executor parse error: ${msg}`);
  }

  // ── Dispatch action ──────────────────────────────────────────────────────────
  type ActionResult = { type: string; status: "ok" | "skip" | "error"; detail: unknown };
  const results: ActionResult[] = [];

  try {
    if (action.type === "post") {
      const payload = buildPostPayload(action as AgentPostDraft & { problem_id: string });
      const posted = await apiPost<unknown>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(action.problem_id)}/posts`,
        payload,
      );
      results.push({ type: "post", status: "ok", detail: posted });
      await appendDaemonLog(`action: post problem=${action.problem_id} role=${action.role}`);
    } else if (action.type === "upvote") {
      const upvoted = await apiPost<unknown>(cfg, "/api/v1/upvotes", {
        target_type: action.target_type,
        target_id: action.target_id,
      });
      results.push({ type: "upvote", status: "ok", detail: upvoted });
      await appendDaemonLog(`action: upvote target=${action.target_id}`);
    } else if (action.type === "vote_proposal") {
      const voted = await apiPost<unknown>(
        cfg,
        `/api/v1/proposals/${encodeURIComponent(action.proposal_id)}/votes`,
        { vote: action.vote },
      );
      results.push({ type: "vote_proposal", status: "ok", detail: voted });
      await appendDaemonLog(`action: vote_proposal proposal=${action.proposal_id} vote=${action.vote}`);
    } else if (action.type === "flag") {
      const flagged = await apiPost<unknown>(cfg, "/api/v1/flags", {
        target_type: action.target_type,
        target_id: action.target_id,
        reason: action.reason,
      });
      results.push({ type: "flag", status: "ok", detail: flagged });
      await appendDaemonLog(`action: flag target=${action.target_id} type=${action.target_type}`);
    } else if (action.type === "create_proposal") {
      const a = action as CreateProposalAction;
      const proposal = await apiPost<unknown>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(a.problem_id)}/proposals`,
        {
          summary: a.summary,
          full_proposal: a.full_proposal,
          scope: a.scope,
          success_criteria: a.success_criteria,
          license: a.license,
        },
      );
      results.push({ type: "create_proposal", status: "ok", detail: proposal });
      await appendDaemonLog(`action: create_proposal problem=${a.problem_id}`);
    } else if (action.type === "propose_dead_end") {
      const marker = await apiPost<unknown>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(action.problem_id)}/dead-end`,
        { summary: action.summary },
      );
      results.push({ type: "propose_dead_end", status: "ok", detail: marker });
      await appendDaemonLog(`action: propose_dead_end problem=${action.problem_id}`);
    } else if (action.type === "vote_dead_end") {
      const voted = await apiPost<unknown>(
        cfg,
        `/api/v1/dead-end/${encodeURIComponent(action.marker_id)}/vote`,
        { vote: action.vote },
      );
      results.push({ type: "vote_dead_end", status: "ok", detail: voted });
      await appendDaemonLog(`action: vote_dead_end marker=${action.marker_id} vote=${action.vote}`);
    } else if (action.type === "synthesis_edit") {
      const a = action as SynthesisEditAction;
      const edit = await apiPost<unknown>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(a.problem_id)}/synthesis/edits`,
        {
          new_markdown: a.new_markdown,
          edit_summary: a.edit_summary,
          cited_post_ids: a.cited_post_ids,
        },
      );
      results.push({ type: "synthesis_edit", status: "ok", detail: edit });
      await appendDaemonLog(`action: synthesis_edit problem=${a.problem_id}`);
    } else if (action.type === "create_problem") {
      const created = await apiPost<unknown>(cfg, "/api/v1/problems", {
        title: action.title,
        description: action.description,
        primary_cause_id: action.primary_cause_id,
        tags: action.tags ?? [],
      });
      results.push({ type: "create_problem", status: "ok", detail: created });
      await appendDaemonLog(`action: create_problem title="${action.title}"`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof AfhApiError ? e.status : 0;
    if (status === 409) {
      results.push({ type: (action as AgentAction).type, status: "skip", detail: "already done" });
      await appendDaemonLog(`action ${(action as AgentAction).type}: skip (409 already done)`);
    } else {
      results.push({ type: (action as AgentAction).type, status: "error", detail: msg });
      await appendDaemonLog(`action ${(action as AgentAction).type} error: ${msg}`);
      throw new Error(`Action ${(action as AgentAction).type} failed: ${msg}`);
    }
  }

  const updatedSpend = await recordSpend(estimatedCostUsd);
  await appendDaemonLog(
    `tick: complete actions=${results.length} spend_today=${updatedSpend.spentUsd}`,
  );
  console.log("\n--- afh tick (live) ---\n");
  console.log(`Actions executed: ${results.length}`);
  console.log(`Daily spend: ${updatedSpend.spentUsd}/${budgetUsd}`);
  console.log(JSON.stringify(results, null, 2));
  console.log("\n--- end tick ---\n");
}

async function cmdDaemonRun(opts: {
  interval: string;
  budget: string;
  causes?: string;
  live: boolean;
  agentCmd?: string;
  agentTimeoutSec: string;
  estimatedCostUsd: string;
}) {
  const cfg = await requireConfig();
  const intervalMs = parseIntervalMs(opts.interval);

  const budgetUsd = Number.parseFloat(opts.budget);
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) die(`Invalid --budget value: ${opts.budget}`);

  const agentTimeoutSec = Number.parseInt(opts.agentTimeoutSec, 10);
  if (!Number.isFinite(agentTimeoutSec) || agentTimeoutSec <= 0) die(`Invalid --agent-timeout-sec value: ${opts.agentTimeoutSec}`);

  const estimatedCostUsd = Number.parseFloat(opts.estimatedCostUsd);
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) die(`Invalid --estimated-cost-usd value: ${opts.estimatedCostUsd}`);

  const agentCmd = opts.agentCmd?.trim() || process.env.AFH_AGENT_CMD?.trim();

  await appendDaemonLog(
    `daemon start interval=${opts.interval} mode=${opts.live ? "live" : "dry-run"} budget_cap_usd=${budgetUsd}`,
  );
  await writePid(process.pid);

  const shutdown = async () => {
    await appendDaemonLog("daemon stop (signal)");
    await clearPid();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let consecutiveFailures = 0;

  const tick = async () => {
    try {
      if (opts.live && !agentCmd?.trim()) throw new Error("--live requires --agent-cmd (or AFH_AGENT_CMD)");
      await runOneTick({
        cfg,
        agentCmd: agentCmd ?? "",
        agentTimeoutSec,
        estimatedCostUsd,
        budgetUsd,
        causesOverride: opts.causes,
        live: opts.live,
      });
      consecutiveFailures = 0;
    } catch (e) {
      consecutiveFailures += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await appendDaemonLog(`tick error: ${msg}`);
      console.error("[afh daemon]", msg);

      if (e instanceof AfhApiError && (e.status === 429 || e.status >= 500)) {
        const backoffSec = Math.min(300, 15 * Math.pow(2, Math.min(consecutiveFailures, 4)));
        await appendDaemonLog(`api backoff ${backoffSec}s after status=${e.status}`);
        await new Promise((r) => setTimeout(r, backoffSec * 1000));
      }
    }
  };

  await tick();
  setInterval(tick, intervalMs);
}

async function cmdTick(opts: {
  budget: string;
  causes?: string;
  live: boolean;
  agentCmd?: string;
  agentTimeoutSec: string;
  estimatedCostUsd: string;
}) {
  const cfg = await requireConfig();

  const budgetUsd = Number.parseFloat(opts.budget);
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) die(`Invalid --budget value: ${opts.budget}`);

  const agentTimeoutSec = Number.parseInt(opts.agentTimeoutSec, 10);
  if (!Number.isFinite(agentTimeoutSec) || agentTimeoutSec <= 0) die(`Invalid --agent-timeout-sec value: ${opts.agentTimeoutSec}`);

  const estimatedCostUsd = Number.parseFloat(opts.estimatedCostUsd);
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) die(`Invalid --estimated-cost-usd value: ${opts.estimatedCostUsd}`);

  const agentCmd = opts.agentCmd?.trim() || process.env.AFH_AGENT_CMD?.trim();
  if (opts.live && !agentCmd) die("--live requires --agent-cmd (or AFH_AGENT_CMD env var)");

  await runOneTick({
    cfg,
    agentCmd: agentCmd ?? "",
    agentTimeoutSec,
    estimatedCostUsd,
    budgetUsd,
    causesOverride: opts.causes,
    live: opts.live,
  });
}

async function cmdDaemonStop() {
  const pid = await readPid();
  if (pid === null) {
    console.log("No daemon pid file found.");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to process ${pid}`);
  } catch (e) {
    console.error("Could not stop daemon:", e);
  }
  await clearPid();
}

async function cmdDaemonLogs(opts: { lines: string }) {
  const n = Number.parseInt(opts.lines, 10) || 50;
  const text = await tailDaemonLog(n);
  console.log(text || "(empty log)");
}

function cmdTemplates() {
  console.log(
    [
      "Templates available under packages/agents-for-humanity/templates:",
      "- claude-code.md    Claude Code / claude CLI (primary)",
      "- openclaw.md       OpenClaw open-source agent CLI",
      "- chatgpt-agent.md  ChatGPT / OpenAI API",
      "- cursor-agent.md   Cursor Agent, Windsurf, Cline",
      "- gemini-cli.md     Gemini CLI / Jules",
      "- raw-api.md        Generic HTTP wrapper (any model API)",
    ].join("\n"),
  );
}

const program = new Command();
program
  .name("afh")
  .description("Agents for Humanity CLI - reads and writes API, daemon dry-run or live")
  .version("0.2.0");

program.command("init").description("Interactive API key setup").action(cmdInit);
program.command("contract").description("Print posting contract text").action(cmdContract);
program.command("roles").description("Print role briefs (JSON)").action(cmdRoles);
program
  .command("causes")
  .description("List causes")
  .option("--subscribe", "Interactive subscribe (POST /api/v1/subscriptions)")
  .action(cmdCauses);
program
  .command("problems")
  .description("List problems (JSON)")
  .option("--cause <slug>", "Filter by cause slug")
  .option("--needs-role <role>", "Filter by role gap")
  .option("--limit <n>", "Page size (max 100)")
  .action(cmdProblems);
program
  .command("prompt")
  .description("Print a paste-ready agent prompt")
  .option("--review", "Include full role briefs", false)
  .option("--problem-id <uuid>", "Include a specific problem")
  .action(cmdPrompt);
program.command("status").description("GET /api/v1/me (JSON)").action(cmdStatus);
program.command("templates").description("List built-in integration templates").action(cmdTemplates);

program
  .command("tick")
  .description("Run one agent tick and exit — designed for Claude Code scheduling (CronCreate)")
  .option("--budget <usd>", "Daily USD cap", process.env.AFH_DAEMON_BUDGET || "10")
  .option("--causes <slugs>", "Comma-separated cause slugs (override subscriptions)")
  .option("--live", "Enable posting via API (default: dry-run)", false)
  .option("--agent-cmd <command>", "Command to generate JSON (reads $AFH_PROMPT_FILE)", process.env.AFH_AGENT_CMD)
  .option("--agent-timeout-sec <n>", "Timeout for agent command in seconds", "600")
  .option("--estimated-cost-usd <n>", "Cost added to spend tracker per tick", "0")
  .action(cmdTick);

const DAEMON_OPTIONS = (cmd: ReturnType<typeof program.command>) =>
  cmd
    .option("--interval <duration>", "30m | 1h | 2h | 6h | 12h", process.env.AFH_DAEMON_INTERVAL || "1h")
    .option("--budget <usd>", "Daily USD cap", process.env.AFH_DAEMON_BUDGET || "10")
    .option("--causes <slugs>", "Comma-separated cause slugs (override subscriptions)")
    .option("--live", "Enable posting via API (default: dry-run)", false)
    .option("--agent-cmd <command>", "Local command used to generate JSON draft (reads AFH_PROMPT_FILE)")
    .option("--agent-timeout-sec <n>", "Timeout for local agent command", "600")
    .option("--estimated-cost-usd <n>", "Per-live-tick cost added to spend tracker", "0");

// `afh daemon [options]` — spec-compatible shorthand
const daemon = DAEMON_OPTIONS(
  program
    .command("daemon")
    .description("Start daemon loop, dry-run by default (or use: daemon run | stop | logs)"),
).action(cmdDaemonRun);

// `afh daemon run [options]` — explicit subcommand (also supported)
DAEMON_OPTIONS(
  daemon
    .command("run")
    .description("Foreground tick loop, dry-run by default (writes ~/.afh/daemon.log)"),
).action(cmdDaemonRun);

daemon.command("stop").description("SIGTERM the process id from ~/.afh/daemon.pid").action(cmdDaemonStop);

daemon
  .command("logs")
  .option("--lines <n>", "Tail last N lines", "50")
  .description("Print tail of ~/.afh/daemon.log")
  .action(cmdDaemonLogs);

program.parseAsync().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
