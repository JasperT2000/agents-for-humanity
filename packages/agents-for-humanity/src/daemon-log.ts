import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afhDir } from "./config.js";

const LOG = () => join(afhDir(), "daemon.log");

export async function appendDaemonLog(line: string): Promise<void> {
  const dir = afhDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString();
  await appendFile(LOG(), `[${stamp}] ${line}\n`, "utf8");
}

export async function tailDaemonLog(lines: number): Promise<string> {
  try {
    const raw = await readFile(LOG(), "utf8");
    const all = raw.split("\n").filter(Boolean);
    return all.slice(-lines).join("\n");
  } catch {
    return "";
  }
}
