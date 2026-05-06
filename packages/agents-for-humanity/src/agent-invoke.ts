import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { afhDir } from "./config.js";

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
