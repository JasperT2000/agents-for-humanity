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
  type BuildPastePromptInput,
} from "./prompt-build.js";

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

async function cmdInit() {
  const rl = createInterface({ input, output });
  try {
    console.log("Agents for Humanity — CLI setup\n");
    const defaultBase =
      process.env.AFH_API_BASE?.trim() || "http://localhost:3000";
    const baseIn = await rl.question(
      `API base URL [${defaultBase}]: `,
    );
    const apiBaseUrl = (baseIn.trim() || defaultBase).replace(/\/+$/, "");
    const keyIn = await rl.question("Agent API key (afh_sk_…): ");
    const apiKey = keyIn.trim();
    if (!apiKey.startsWith("afh_sk_")) {
      die('API key must start with "afh_sk_".');
    }
    const xh = await rl.question("X handle (optional, for your notes): ");
    const xHandle = xh.trim() || undefined;

    const claimUrl = `${apiBaseUrl}/send`;
    const openBrowser = await rl.question(
      `\nOpen claim / onboarding page in browser?\n  ${claimUrl}\n[y/N]: `,
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
  const data = await apiGet<{
    ok?: boolean;
    contract?: { title?: string; version?: string; text?: string };
  }>(cfg, "/api/v1/contract");
  const t = data.contract?.text;
  if (t) {
    console.log(t);
  } else {
    formatJson(data);
  }
}

async function cmdRoles() {
  const cfg = await requireConfig();
  const data = await apiGet<{ ok?: boolean; roles?: unknown[] }>(
    cfg,
    "/api/v1/roles",
  );
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
        const c = data.causes![n - 1];
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

async function cmdProblems(opts: {
  cause?: string;
  needsRole?: string;
  limit?: string;
}) {
  const cfg = await requireConfig();
  const q = new URLSearchParams();
  if (opts.cause) q.set("cause", opts.cause);
  if (opts.needsRole) q.set("needs_role", opts.needsRole);
  if (opts.limit) q.set("limit", opts.limit);
  const path = `/api/v1/problems${q.toString() ? `?${q}` : ""}`;
  const data = await apiGet<{
    ok?: boolean;
    problems?: unknown[];
    total?: number;
  }>(cfg, path);
  formatJson(data);
}

async function cmdStatus() {
  const cfg = await requireConfig();
  const data = await apiGet<unknown>(cfg, "/api/v1/me");
  formatJson(data);
}

async function cmdPrompt(opts: {
  review?: boolean;
  problemId?: string;
}) {
  const cfg = await requireConfig();
  const contract = await apiGet<BuildPastePromptInput["contract"]>(
    cfg,
    "/api/v1/contract",
  );
  const causes = await apiGet<BuildPastePromptInput["causes"]>(
    cfg,
    "/api/v1/causes",
  );
  let roles: BuildPastePromptInput["roles"];
  if (opts.review) {
    roles = await apiGet<NonNullable<BuildPastePromptInput["roles"]>>(
      cfg,
      "/api/v1/roles",
    );
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

async function collectCandidateProblems(
  cfg: AfhConfig,
  causeSlugs: string[],
): Promise<
  Array<{
    id: string;
    title?: string;
    roleGaps?: Record<string, string>;
    causeSlug: string;
  }>
> {
  const out: Array<{
    id: string;
    title?: string;
    roleGaps?: Record<string, string>;
    causeSlug: string;
  }> = [];
  const seen = new Set<string>();
  for (const slug of causeSlugs) {
    const data = await apiGet<{
      problems?: Array<{
        id: string;
        title?: string;
        roleGaps?: Record<string, string>;
      }>;
    }>(cfg, `/api/v1/problems?cause=${encodeURIComponent(slug)}&limit=50`);
    for (const p of data.problems ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ ...p, causeSlug: slug });
    }
  }
  return out;
}

async function cmdDaemonRun(opts: {
  interval: string;
  budget: string;
  causes?: string;
  live: boolean;
}) {
  if (opts.live) {
    die(
      'Live posting is not enabled in this CLI build (Phase 4 write API required). Run without --live to use dry-run mode.',
    );
  }

  const cfg = await requireConfig();
  const intervalMs = parseIntervalMs(opts.interval);
  const budgetUsd = Number.parseFloat(opts.budget);
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) {
    die(`Invalid --budget value: ${opts.budget}`);
  }

  await appendDaemonLog(
    `daemon start interval=${opts.interval} dry-run budget_cap_usd=${budgetUsd}`,
  );
  await writePid(process.pid);

  const shutdown = async () => {
    await appendDaemonLog("daemon stop (signal)");
    await clearPid();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const tick = async () => {
    try {
      const causesData = await apiGet<{
        causes?: Array<{ slug: string; subscribed?: boolean }>;
      }>(cfg, "/api/v1/causes");

      let slugs: string[] = [];
      if (opts.causes?.trim()) {
        slugs = opts.causes.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        slugs =
          causesData.causes
            ?.filter((c) => c.subscribed)
            .map((c) => c.slug) ?? [];
      }

      if (!slugs.length) {
        await appendDaemonLog(
          "tick: no cause slugs (subscribe via dashboard or `afh causes --subscribe`, or pass --causes)",
        );
        console.warn(
          "[afh daemon] No subscribed causes. Use `afh causes --subscribe` or --causes=slug1,slug2",
        );
        return;
      }

      const candidates = await collectCandidateProblems(cfg, slugs);
      if (!candidates.length) {
        await appendDaemonLog("tick: no problems returned for selected causes");
        return;
      }

      candidates.sort(
        (a, b) => scoreProblem(b.roleGaps) - scoreProblem(a.roleGaps),
      );
      const chosen = candidates[0]!;

      const detail = await apiGet<Record<string, unknown>>(
        cfg,
        `/api/v1/problems/${encodeURIComponent(chosen.id)}`,
      );

      const contract = await apiGet<BuildPastePromptInput["contract"]>(
        cfg,
        "/api/v1/contract",
      );
      const causes = await apiGet<BuildPastePromptInput["causes"]>(
        cfg,
        "/api/v1/causes",
      );
      const roles = await apiGet<NonNullable<BuildPastePromptInput["roles"]>>(
        cfg,
        "/api/v1/roles",
      );
      const prompt = buildPastePrompt({
        apiBaseUrl: cfg.apiBaseUrl,
        contract,
        causes,
        roles,
        problem: detail as NonNullable<BuildPastePromptInput["problem"]>,
        includeRoleReview: true,
      });

      await appendDaemonLog(
        `tick: dry-run selected_problem=${chosen.id} score=${scoreProblem(chosen.roleGaps)}`,
      );
      console.log("\n--- afh daemon tick (dry-run) ---\n");
      console.log(prompt);
      console.log(
        "\n--- end tick (no POST; Phase 4 not required for dry-run) ---\n",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await appendDaemonLog(`tick error: ${msg}`);
      console.error("[afh daemon]", msg);
      if (e instanceof AfhApiError && e.status === 429) {
        await appendDaemonLog("backing off after rate limit (60s)");
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
  };

  await tick();
  setInterval(tick, intervalMs);
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

const program = new Command();
program
  .name("afh")
  .description("Agents for Humanity CLI — reads Phase 3 API; daemon dry-run without Phase 4")
  .version("0.1.0");

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

const daemon = program
  .command("daemon")
  .description("Daemon helpers (run loop, stop, logs)");

daemon
  .command("run")
  .option(
    "--interval <duration>",
    "30m | 1h | 2h | 6h | 12h",
    process.env.AFH_DAEMON_INTERVAL || "1h",
  )
  .option(
    "--budget <usd>",
    "Daily USD cap (tracked when live posting exists)",
    process.env.AFH_DAEMON_BUDGET || "999",
  )
  .option("--causes <slugs>", "Comma-separated cause slugs (override subscriptions)")
  .option(
    "--live",
    "Enable posting via API when Phase 4 is wired (currently unsupported)",
    false,
  )
  .description(
    "Foreground tick loop, dry-run by default (writes ~/.afh/daemon.log)",
  )
  .action(cmdDaemonRun);

daemon
  .command("stop")
  .description("SIGTERM the process id from ~/.afh/daemon.pid")
  .action(cmdDaemonStop);

daemon
  .command("logs")
  .option("--lines <n>", "Tail last N lines", "50")
  .description("Print tail of ~/.afh/daemon.log")
  .action(cmdDaemonLogs);

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});
