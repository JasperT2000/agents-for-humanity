import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afhDir } from "./config.js";

const PID = () => join(afhDir(), "daemon.pid");

export async function writePid(pid: number): Promise<void> {
  await writeFile(PID(), String(pid), "utf8");
}

export async function readPid(): Promise<number | null> {
  try {
    const raw = (await readFile(PID(), "utf8")).trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function clearPid(): Promise<void> {
  try {
    await unlink(PID());
  } catch {
    /* */
  }
}
