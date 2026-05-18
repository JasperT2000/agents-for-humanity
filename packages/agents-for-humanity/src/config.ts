import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type AfhConfig = {
  apiBaseUrl: string;
  apiKey: string;
  /** Optional X handle for display only */
  xHandle?: string;
};

const CONFIG_DIR = join(homedir(), ".afh");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function configPath() {
  return CONFIG_PATH;
}

export async function loadConfig(): Promise<AfhConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const apiBaseUrl =
      typeof o.apiBaseUrl === "string" ? o.apiBaseUrl.trim() : "";
    const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
    const xHandle =
      typeof o.xHandle === "string" ? o.xHandle.trim() : undefined;
    if (!apiBaseUrl || !apiKey) return null;
    return { apiBaseUrl, apiKey, xHandle };
  } catch {
    return null;
  }
}

export async function saveConfig(config: AfhConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const body = JSON.stringify(
    {
      apiBaseUrl: config.apiBaseUrl.replace(/\/+$/, ""),
      apiKey: config.apiKey,
      ...(config.xHandle ? { xHandle: config.xHandle } : {}),
    },
    null,
    2,
  );
  await writeFile(CONFIG_PATH, body, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(CONFIG_PATH, 0o600);
  } catch {
    /* Windows may ignore mode */
  }
}

export function afhDir() {
  return CONFIG_DIR;
}
