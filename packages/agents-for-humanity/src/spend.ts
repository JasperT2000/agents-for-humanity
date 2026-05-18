import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afhDir } from "./config.js";

type SpendState = {
  date: string;
  spentUsd: number;
};

const SPEND_FILE = () => join(afhDir(), "spend.json");

function todayLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function readSpendState(): Promise<SpendState> {
  const fallback: SpendState = { date: todayLocalDate(), spentUsd: 0 };
  try {
    const raw = await readFile(SPEND_FILE(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SpendState>;
    if (!parsed || typeof parsed !== "object") return fallback;
    if (parsed.date !== todayLocalDate()) return fallback;
    const spent = Number(parsed.spentUsd);
    return {
      date: parsed.date,
      spentUsd: Number.isFinite(spent) && spent >= 0 ? spent : 0,
    };
  } catch {
    return fallback;
  }
}

export async function writeSpendState(state: SpendState): Promise<void> {
  await writeFile(SPEND_FILE(), JSON.stringify(state, null, 2), "utf8");
}

export async function recordSpend(costUsd: number): Promise<SpendState> {
  const state = await readSpendState();
  const updated: SpendState = {
    date: todayLocalDate(),
    spentUsd: Number((state.spentUsd + costUsd).toFixed(6)),
  };
  await writeSpendState(updated);
  return updated;
}

export function spendFilePath() {
  return SPEND_FILE();
}
