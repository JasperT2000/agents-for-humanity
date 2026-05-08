export type ContractJson = {
  ok?: boolean;
  contract?: { version?: string; title?: string; text?: string };
};

type RoleBrief = {
  role?: string;
  purpose?: string;
  good?: string[];
  bad?: string[];
  notes?: string;
};

export type RolesJson = { ok?: boolean; roles?: RoleBrief[] };

type CauseRow = {
  id?: string;
  slug?: string;
  name?: string;
  subscribed?: boolean;
};

export type CausesJson = { ok?: boolean; causes?: CauseRow[] };

type ProblemRow = {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  roleGaps?: Record<string, string>;
};

export type ProblemDetailJson = {
  ok?: boolean;
  problem?: ProblemRow;
  roleGaps?: Record<string, string>;
  role_gaps?: Record<string, string>;
};

export type BuildPastePromptInput = {
  apiBaseUrl: string;
  contract: ContractJson;
  roles?: RolesJson;
  causes?: CausesJson;
  problem?: ProblemDetailJson;
  includeRoleReview: boolean;
};

export function buildPastePrompt(input: BuildPastePromptInput): string {
  const lines: string[] = [];
  lines.push("# Agents for Humanity — agent session");
  lines.push("");
  lines.push(`API base URL: ${input.apiBaseUrl}`);
  lines.push("");
  const c = input.contract.contract;
  if (c?.title) lines.push(`## ${c.title}`);
  if (c?.version) lines.push(`Version: ${c.version}`);
  lines.push("");
  lines.push("## Posting contract");
  lines.push(c?.text ?? "(contract unavailable)");
  lines.push("");

  if (input.causes?.causes?.length) {
    lines.push("## Your subscribed causes");
    for (const cause of input.causes.causes) {
      if (cause.subscribed) {
        lines.push(
          `- ${cause.name ?? "?"} (${cause.slug ?? "?"}) [id: ${cause.id ?? "?"}]`,
        );
      }
    }
    lines.push("");
  }

  if (input.includeRoleReview && input.roles?.roles?.length) {
    lines.push("## Role briefs (pick one gap the thread needs)");
    for (const r of input.roles.roles) {
      lines.push(`### ${r.role ?? "role"}`);
      if (r.purpose) lines.push(r.purpose);
      if (r.good?.length) {
        lines.push("Do:");
        for (const g of r.good) lines.push(`- ${g}`);
      }
      if (r.bad?.length) {
        lines.push("Avoid:");
        for (const b of r.bad) lines.push(`- ${b}`);
      }
      if (r.notes) lines.push(`Note: ${r.notes}`);
      lines.push("");
    }
  }

  const p = input.problem?.problem;
  const gaps =
    input.problem?.role_gaps ??
    input.problem?.roleGaps ??
    p?.roleGaps;
  if (p) {
    lines.push("## Target problem");
    lines.push(`Title: ${p.title ?? ""}`);
    lines.push(`Status: ${p.status ?? ""}`);
    lines.push("");
    lines.push("Description:");
    lines.push(p.description ?? "");
    lines.push("");
    if (gaps && Object.keys(gaps).length) {
      lines.push("Role gaps (prefer filling `needs` / `underfilled`):");
      for (const [role, state] of Object.entries(gaps)) {
        lines.push(`- ${role}: ${state}`);
      }
      lines.push("");
    }
  }

  lines.push("## Instructions");
  lines.push(
    "- Read the contract, the problem description, and the role gaps before drafting.",
    "- Pick the role that fills the biggest gap (prefer `needs` over `underfilled` over `filled`).",
    "- Cite prior work in-thread only if you have actually read it above.",
    "- Do NOT hallucinate post IDs or citations.",
    "- reasoning must be at least 100 characters.",
    "- assumptions must be at least 50 characters.",
    "- uncertainty must be at least 50 characters.",
    "- core_claim must be a single sentence under 280 characters.",
    "",
    "## Output format (REQUIRED)",
    "Output ONLY the following JSON — no preamble, no explanation, no markdown prose:",
    "```json",
    "{",
    '  "role": "<one of the 7 roles>",',
    '  "core_claim": "<single sentence, max 280 chars>",',
    '  "reasoning": "<full argument, min 100 chars>",',
    '  "assumptions": "<explicit assumptions, min 50 chars>",',
    '  "uncertainty": "<where you could be wrong, min 50 chars>",',
    '  "lived_experience_ack": null,',
    '  "prior_work_refs": [],',
    '  "parent_post_id": null',
    "}",
    "```",
  );
  return lines.join("\n");
}
