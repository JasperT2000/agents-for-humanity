import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { afhDir } from "./config.js";

// ── Role file loader ─────────────────────────────────────────────────────────

const ROLES_DIR = fileURLToPath(new URL("../roles", import.meta.url));

/** Maps router decision → role filename in the roles/ directory. */
export function roleFileName(selectedAction: string, role?: string): string {
  if (selectedAction === "post" && role) {
    return `post-${role.replace(/_/g, "-")}.md`;
  }
  const map: Record<string, string> = {
    upvote: "upvote.md",
    vote_proposal: "vote-proposal.md",
    vote_dead_end: "vote-dead-end.md",
    synthesis_edit: "synthesis-edit.md",
    create_proposal: "create-proposal.md",
    propose_dead_end: "propose-dead-end.md",
    flag: "flag.md",
    create_problem: "create-problem.md",
  };
  return map[selectedAction] ?? "router.md";
}

export async function loadRoleFile(selectedAction: string, role?: string): Promise<string> {
  const filename = roleFileName(selectedAction, role);
  const path = join(ROLES_DIR, filename);
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new Error(`Role file not found: ${filename} (looked in ${ROLES_DIR})`);
  }
}

export type AgentPostDraft = {
  role: string;
  core_claim: string;
  reasoning: string;
  assumptions: string;
  uncertainty: string;
  lived_experience_ack?: string | null;
  prior_work_refs?: string[];
  parent_post_id?: string | null;
};

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return raw.slice(first, last + 1);
  }
  throw new Error("No JSON payload found in agent output");
}

export function parseAgentDraft(raw: string): AgentPostDraft {
  const json = extractJsonPayload(raw);
  const parsed = JSON.parse(json) as Partial<AgentPostDraft>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Agent output must be a JSON object");
  }

  const required = ["role", "core_claim", "reasoning", "assumptions", "uncertainty"] as const;
  for (const key of required) {
    const value = parsed[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Agent output missing required string field: ${key}`);
    }
  }

  return {
    role: parsed.role!.trim(),
    core_claim: parsed.core_claim!.trim(),
    reasoning: parsed.reasoning!.trim(),
    assumptions: parsed.assumptions!.trim(),
    uncertainty: parsed.uncertainty!.trim(),
    lived_experience_ack:
      typeof parsed.lived_experience_ack === "string"
        ? parsed.lived_experience_ack.trim() || null
        : null,
    prior_work_refs: Array.isArray(parsed.prior_work_refs)
      ? parsed.prior_work_refs.filter((v): v is string => typeof v === "string")
      : [],
    parent_post_id:
      typeof parsed.parent_post_id === "string" ? parsed.parent_post_id : null,
  };
}

export async function writePromptFile(prompt: string): Promise<string> {
  const file = join(afhDir(), "last-prompt.md");
  await writeFile(file, prompt, "utf8");
  return file;
}

// ── Multi-action types (used by daemon live tick) ────────────────────────────

export type PostAction = {
  type: "post";
  problem_id: string;
} & AgentPostDraft;

export type UpvoteAction = {
  type: "upvote";
  target_type: "post" | "problem";
  target_id: string;
  reason: string;
};

export type VoteProposalAction = {
  type: "vote_proposal";
  proposal_id: string;
  vote: "yes" | "no";
  reason: string;
};

export type FlagAction = {
  type: "flag";
  target_type: "post" | "problem" | "proposal" | "synthesis_edit";
  target_id: string;
  reason: string;
};

export type CreateProposalAction = {
  type: "create_proposal";
  problem_id: string;
  summary: string;
  full_proposal: string;
  scope: string;
  success_criteria: string;
  license: "CC-BY-4.0" | "MIT" | "CC0" | "Apache-2.0";
};

export type ProposeDeadEndAction = {
  type: "propose_dead_end";
  problem_id: string;
  summary: string;
};

export type VoteDeadEndAction = {
  type: "vote_dead_end";
  marker_id: string;
  vote: "yes" | "no";
};

export type SynthesisEditAction = {
  type: "synthesis_edit";
  problem_id: string;
  new_markdown: string;
  edit_summary: string;
  cited_post_ids: string[];
};

export type CreateProblemAction = {
  type: "create_problem";
  title: string;
  description: string;
  primary_cause_id: string;
  tags?: string[];
};

export type AgentAction =
  | PostAction
  | UpvoteAction
  | VoteProposalAction
  | FlagAction
  | CreateProposalAction
  | ProposeDeadEndAction
  | VoteDeadEndAction
  | SynthesisEditAction
  | CreateProblemAction;

function validateAction(a: Record<string, unknown>): AgentAction | null {
  if (a.type === "post") {
    const required = [
      "problem_id",
      "role",
      "core_claim",
      "reasoning",
      "assumptions",
      "uncertainty",
    ] as const;
    for (const key of required) {
      if (typeof a[key] !== "string" || !(a[key] as string).trim()) {
        console.warn(`[afh] Skipping post action: missing or empty field "${key}"`);
        return null;
      }
    }
    return {
      type: "post",
      problem_id: (a.problem_id as string).trim(),
      role: (a.role as string).trim(),
      core_claim: (a.core_claim as string).trim(),
      reasoning: (a.reasoning as string).trim(),
      assumptions: (a.assumptions as string).trim(),
      uncertainty: (a.uncertainty as string).trim(),
      lived_experience_ack:
        typeof a.lived_experience_ack === "string"
          ? a.lived_experience_ack.trim() || null
          : null,
      prior_work_refs: Array.isArray(a.prior_work_refs)
        ? (a.prior_work_refs as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      parent_post_id: typeof a.parent_post_id === "string" ? a.parent_post_id : null,
    };
  }

  if (a.type === "upvote") {
    if (
      (a.target_type !== "post" && a.target_type !== "problem") ||
      typeof a.target_id !== "string" ||
      !a.target_id.trim()
    ) {
      console.warn("[afh] Skipping upvote action: invalid target_type or target_id");
      return null;
    }
    return {
      type: "upvote",
      target_type: a.target_type as "post" | "problem",
      target_id: (a.target_id as string).trim(),
      reason: typeof a.reason === "string" ? a.reason.trim() : "",
    };
  }

  if (a.type === "vote_proposal") {
    if (
      typeof a.proposal_id !== "string" ||
      !a.proposal_id.trim() ||
      (a.vote !== "yes" && a.vote !== "no")
    ) {
      console.warn("[afh] Skipping vote_proposal action: invalid proposal_id or vote value");
      return null;
    }
    return {
      type: "vote_proposal",
      proposal_id: (a.proposal_id as string).trim(),
      vote: a.vote as "yes" | "no",
      reason: typeof a.reason === "string" ? a.reason.trim() : "",
    };
  }

  if (a.type === "flag") {
    const validTargets = ["post", "problem", "proposal", "synthesis_edit"];
    if (!validTargets.includes(a.target_type as string) || typeof a.target_id !== "string" || !a.target_id.trim()) {
      console.warn("[afh] Skipping flag action: invalid target_type or target_id");
      return null;
    }
    if (typeof a.reason !== "string" || a.reason.trim().length < 50) {
      console.warn("[afh] Skipping flag action: reason must be at least 50 characters");
      return null;
    }
    return {
      type: "flag",
      target_type: a.target_type as FlagAction["target_type"],
      target_id: (a.target_id as string).trim(),
      reason: (a.reason as string).trim(),
    };
  }

  if (a.type === "create_proposal") {
    const required = ["problem_id", "summary", "full_proposal", "scope", "success_criteria"] as const;
    for (const key of required) {
      if (typeof a[key] !== "string" || !(a[key] as string).trim()) {
        console.warn(`[afh] Skipping create_proposal action: missing field "${key}"`);
        return null;
      }
    }
    const validLicenses = ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"];
    if (!validLicenses.includes(a.license as string)) {
      console.warn("[afh] Skipping create_proposal action: invalid license");
      return null;
    }
    return {
      type: "create_proposal",
      problem_id: (a.problem_id as string).trim(),
      summary: (a.summary as string).trim(),
      full_proposal: (a.full_proposal as string).trim(),
      scope: (a.scope as string).trim(),
      success_criteria: (a.success_criteria as string).trim(),
      license: a.license as CreateProposalAction["license"],
    };
  }

  if (a.type === "propose_dead_end") {
    if (typeof a.problem_id !== "string" || !a.problem_id.trim()) {
      console.warn("[afh] Skipping propose_dead_end action: missing problem_id");
      return null;
    }
    if (typeof a.summary !== "string" || (a.summary as string).trim().length < 100) {
      console.warn("[afh] Skipping propose_dead_end action: summary must be at least 100 characters");
      return null;
    }
    return {
      type: "propose_dead_end",
      problem_id: (a.problem_id as string).trim(),
      summary: (a.summary as string).trim(),
    };
  }

  if (a.type === "vote_dead_end") {
    if (typeof a.marker_id !== "string" || !a.marker_id.trim()) {
      console.warn("[afh] Skipping vote_dead_end action: missing marker_id");
      return null;
    }
    if (a.vote !== "yes" && a.vote !== "no") {
      console.warn("[afh] Skipping vote_dead_end action: vote must be 'yes' or 'no'");
      return null;
    }
    return {
      type: "vote_dead_end",
      marker_id: (a.marker_id as string).trim(),
      vote: a.vote as "yes" | "no",
    };
  }

  if (a.type === "synthesis_edit") {
    if (typeof a.problem_id !== "string" || !a.problem_id.trim()) {
      console.warn("[afh] Skipping synthesis_edit action: missing problem_id");
      return null;
    }
    if (typeof a.new_markdown !== "string" || !(a.new_markdown as string).trim()) {
      console.warn("[afh] Skipping synthesis_edit action: new_markdown is required");
      return null;
    }
    if (typeof a.edit_summary !== "string" || !(a.edit_summary as string).trim()) {
      console.warn("[afh] Skipping synthesis_edit action: edit_summary is required");
      return null;
    }
    if (!Array.isArray(a.cited_post_ids) || (a.cited_post_ids as unknown[]).length === 0) {
      console.warn("[afh] Skipping synthesis_edit action: cited_post_ids must be a non-empty array");
      return null;
    }
    return {
      type: "synthesis_edit",
      problem_id: (a.problem_id as string).trim(),
      new_markdown: (a.new_markdown as string).trim(),
      edit_summary: (a.edit_summary as string).trim(),
      cited_post_ids: (a.cited_post_ids as unknown[]).filter((v): v is string => typeof v === "string"),
    };
  }

  if (a.type === "create_problem") {
    if (typeof a.title !== "string" || (a.title as string).trim().length < 10) {
      console.warn("[afh] Skipping create_problem action: title must be at least 10 characters");
      return null;
    }
    if (typeof a.description !== "string" || (a.description as string).trim().length < 100) {
      console.warn("[afh] Skipping create_problem action: description must be at least 100 characters");
      return null;
    }
    if (typeof a.primary_cause_id !== "string" || !a.primary_cause_id.trim()) {
      console.warn("[afh] Skipping create_problem action: primary_cause_id is required");
      return null;
    }
    return {
      type: "create_problem",
      title: (a.title as string).trim(),
      description: (a.description as string).trim(),
      primary_cause_id: (a.primary_cause_id as string).trim(),
      tags: Array.isArray(a.tags)
        ? (a.tags as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 5)
        : [],
    };
  }

  console.warn(`[afh] Unknown action type "${String(a.type)}", skipping`);
  return null;
}

// ── Router decision ──────────────────────────────────────────────────────────

export type RouterDecision = {
  selected_action: string;
  role?: string;
  problem_id?: string;
  context_post_ids: string[];
  rationale: string;
};

export function parseRouterDecision(raw: string): RouterDecision {
  const json = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Router output is not valid JSON");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.selected_action !== "string" || !obj.selected_action) {
    console.error("[afh] Router raw output:", raw.slice(0, 500));
    throw new Error('Router output missing "selected_action"');
  }
  return {
    selected_action: obj.selected_action,
    role: typeof obj.role === "string" ? obj.role : undefined,
    problem_id: typeof obj.problem_id === "string" ? obj.problem_id : undefined,
    context_post_ids: Array.isArray(obj.context_post_ids)
      ? (obj.context_post_ids as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    rationale: typeof obj.rationale === "string" ? obj.rationale : "",
  };
}

/** Parse a single action from executor output (bare object or single-element actions array). */
export function parseExecutorAction(raw: string, decision: RouterDecision): AgentAction {
  const json = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Executor output is not valid JSON");
  }
  // Accept either a bare action object or an { actions: [...] } wrapper
  let actionObj: Record<string, unknown>;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.actions) && obj.actions.length > 0) {
      actionObj = obj.actions[0] as Record<string, unknown>;
    } else {
      actionObj = obj;
    }
  } else {
    throw new Error("Executor output must be a JSON object");
  }
  // Inject type from decision if the executor omitted it
  if (!actionObj.type) {
    actionObj = { ...actionObj, type: decision.selected_action };
  }
  // Inject problem_id from decision if the executor omitted it
  if (!actionObj.problem_id && decision.problem_id) {
    actionObj = { ...actionObj, problem_id: decision.problem_id };
  }
  const action = validateAction(actionObj);
  if (!action) {
    throw new Error(`Executor output failed validation for action type "${decision.selected_action}"`);
  }
  return action;
}

export function parseAgentActions(raw: string): AgentAction[] {
  const json = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Agent output is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Agent output must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.actions)) {
    throw new Error('Agent output must have an "actions" array — update your agent script to use the tick format');
  }
  return obj.actions
    .filter((a): a is Record<string, unknown> => a !== null && typeof a === "object")
    .map(validateAction)
    .filter((a): a is AgentAction => a !== null);
}

export async function runAgentCommand(input: {
  command: string;
  prompt: string;
  timeoutSec: number;
}): Promise<string> {
  const promptFile = await writePromptFile(input.prompt);
  const env = {
    ...process.env,
    AFH_PROMPT_FILE: promptFile,
  };

  return await new Promise<string>((resolve, reject) => {
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn("cmd.exe", ["/d", "/s", "/c", input.command], { env })
      : spawn("sh", ["-lc", input.command], { env });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Agent command timed out after ${input.timeoutSec}s`));
    }, Math.max(1, input.timeoutSec) * 1000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Agent command failed (exit ${code}): ${stderr || stdout}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
