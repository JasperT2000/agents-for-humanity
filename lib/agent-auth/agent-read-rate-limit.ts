import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const DEFAULT_PER_MINUTE = 120;
const DEFAULT_PER_HOUR = 2000;

type MemoryBuckets = { minute: number[]; hour: number[] };

const memoryBuckets = new Map<string, MemoryBuckets>();

let upstashMinute: Ratelimit | null = null;
let upstashHour: Ratelimit | null = null;

export function resetAgentReadRateLimitMemoryForTests() {
  memoryBuckets.clear();
}

export function getReadRateLimitConfig() {
  const rawMin = Number.parseInt(process.env.AFH_READ_RL_PER_MINUTE || "", 10);
  const perMinute =
    Number.isFinite(rawMin) && rawMin >= 1 ? rawMin : DEFAULT_PER_MINUTE;
  const rawHour = Number.parseInt(process.env.AFH_READ_RL_PER_HOUR || "", 10);
  const perHour = Number.isFinite(rawHour) && rawHour >= 1 ? rawHour : DEFAULT_PER_HOUR;
  return { perMinute, perHour };
}

function getUpstashLimiters(): { minute: Ratelimit; hour: Ratelimit } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!upstashMinute || !upstashHour) {
    const redis = new Redis({ url, token });
    upstashMinute = new Ratelimit({
      redis,
      prefix: "afh:agent-read:1m",
      limiter: Ratelimit.slidingWindow(DEFAULT_PER_MINUTE, "1 m"),
    });
    upstashHour = new Ratelimit({
      redis,
      prefix: "afh:agent-read:1h",
      limiter: Ratelimit.slidingWindow(DEFAULT_PER_HOUR, "1 h"),
    });
  }
  return { minute: upstashMinute, hour: upstashHour };
}

function enforceMemory(agentId: string, limits: { perMinute: number; perHour: number }) {
  const now = Date.now();
  let buckets = memoryBuckets.get(agentId);
  if (!buckets) {
    buckets = { minute: [], hour: [] };
    memoryBuckets.set(agentId, buckets);
  }
  buckets.minute = buckets.minute.filter((t) => t > now - 60_000);
  buckets.hour = buckets.hour.filter((t) => t > now - 3_600_000);
  if (buckets.minute.length >= limits.perMinute || buckets.hour.length >= limits.perHour) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  buckets.minute.push(now);
  buckets.hour.push(now);
}

/**
 * Enforces Phase 3 read limits: 120 req/min and 2000 req/hour per agent (spec).
 * Uses Upstash when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set;
 * otherwise uses in-process sliding windows (single-instance / dev only).
 * Set DISABLE_AGENT_READ_RATE_LIMIT=1 to skip (e.g. local debugging).
 * Tests can set AFH_READ_RL_PER_MINUTE / AFH_READ_RL_PER_HOUR for faster checks.
 */
export async function enforceAgentReadRateLimit(agentId: string): Promise<void> {
  if (process.env.DISABLE_AGENT_READ_RATE_LIMIT === "1") return;

  const upstash = getUpstashLimiters();
  if (upstash) {
    const [a, b] = await Promise.all([
      upstash.minute.limit(agentId),
      upstash.hour.limit(agentId),
    ]);
    if (!a.success || !b.success) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    return;
  }

  enforceMemory(agentId, getReadRateLimitConfig());
}
