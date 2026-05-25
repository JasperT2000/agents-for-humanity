import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const DEFAULT_PER_MINUTE = 60;
const DEFAULT_PER_HOUR = 600;

type MemoryBuckets = { minute: number[]; hour: number[] };

const memoryBuckets = new Map<string, MemoryBuckets>();

let upstashMinute: Ratelimit | null = null;
let upstashHour: Ratelimit | null = null;

export function resetIpRateLimitMemoryForTests() {
  memoryBuckets.clear();
}

export class IpRateLimitError extends Error {
  constructor() {
    super("IP_RATE_LIMIT_EXCEEDED");
    this.name = "IpRateLimitError";
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "unknown";
}

function getUpstashLimiters(): { minute: Ratelimit; hour: Ratelimit } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!upstashMinute || !upstashHour) {
    const redis = new Redis({ url, token });
    upstashMinute = new Ratelimit({
      redis,
      prefix: "afh:ip:1m",
      limiter: Ratelimit.slidingWindow(DEFAULT_PER_MINUTE, "1 m"),
    });
    upstashHour = new Ratelimit({
      redis,
      prefix: "afh:ip:1h",
      limiter: Ratelimit.slidingWindow(DEFAULT_PER_HOUR, "1 h"),
    });
  }
  return { minute: upstashMinute, hour: upstashHour };
}

function enforceMemory(ip: string) {
  const now = Date.now();
  let buckets = memoryBuckets.get(ip);
  if (!buckets) {
    buckets = { minute: [], hour: [] };
    memoryBuckets.set(ip, buckets);
  }
  buckets.minute = buckets.minute.filter((t) => t > now - 60_000);
  buckets.hour = buckets.hour.filter((t) => t > now - 3_600_000);
  if (
    buckets.minute.length >= DEFAULT_PER_MINUTE ||
    buckets.hour.length >= DEFAULT_PER_HOUR
  ) {
    throw new IpRateLimitError();
  }
  buckets.minute.push(now);
  buckets.hour.push(now);
}

/**
 * Per-IP rate limit for unauthenticated endpoints (webhooks, health checks).
 * 60 req/min + 600 req/hr per IP. Uses Upstash when configured; otherwise
 * an in-memory sliding window (single-instance / dev only).
 *
 * Throws IpRateLimitError when exceeded — caller should return 429.
 */
export async function enforceIpRateLimit(req: Request): Promise<void> {
  if (process.env.DISABLE_IP_RATE_LIMIT === "1") return;

  const ip = getClientIp(req);
  const upstash = getUpstashLimiters();
  if (upstash) {
    const [a, b] = await Promise.all([
      upstash.minute.limit(ip),
      upstash.hour.limit(ip),
    ]);
    if (!a.success || !b.success) {
      throw new IpRateLimitError();
    }
    return;
  }

  enforceMemory(ip);
}

export function ipRateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "RATE_LIMIT_EXCEEDED" }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    },
  );
}
