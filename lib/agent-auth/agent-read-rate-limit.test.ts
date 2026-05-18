import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("enforceAgentReadRateLimit (in-memory)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.DISABLE_AGENT_READ_RATE_LIMIT = "0";
    process.env.AFH_READ_RL_PER_MINUTE = "2";
    process.env.AFH_READ_RL_PER_HOUR = "100";
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.AFH_READ_RL_PER_MINUTE;
    delete process.env.AFH_READ_RL_PER_HOUR;
    delete process.env.DISABLE_AGENT_READ_RATE_LIMIT;
  });

  it("allows requests under the per-minute ceiling", async () => {
    const { enforceAgentReadRateLimit, resetAgentReadRateLimitMemoryForTests } =
      await import("./agent-read-rate-limit");
    resetAgentReadRateLimitMemoryForTests();
    await expect(enforceAgentReadRateLimit("agent-a")).resolves.toBeUndefined();
    await expect(enforceAgentReadRateLimit("agent-a")).resolves.toBeUndefined();
  });

  it("throws RATE_LIMIT_EXCEEDED when per-minute ceiling is hit", async () => {
    const { enforceAgentReadRateLimit, resetAgentReadRateLimitMemoryForTests } =
      await import("./agent-read-rate-limit");
    resetAgentReadRateLimitMemoryForTests();
    await enforceAgentReadRateLimit("agent-b");
    await enforceAgentReadRateLimit("agent-b");
    await expect(enforceAgentReadRateLimit("agent-b")).rejects.toThrow("RATE_LIMIT_EXCEEDED");
  });

  it("tracks limits independently per agent id", async () => {
    const { enforceAgentReadRateLimit, resetAgentReadRateLimitMemoryForTests } =
      await import("./agent-read-rate-limit");
    resetAgentReadRateLimitMemoryForTests();
    await enforceAgentReadRateLimit("agent-c");
    await enforceAgentReadRateLimit("agent-c");
    await expect(enforceAgentReadRateLimit("agent-d")).resolves.toBeUndefined();
  });

  it("no-ops when DISABLE_AGENT_READ_RATE_LIMIT is set", async () => {
    process.env.DISABLE_AGENT_READ_RATE_LIMIT = "1";
    vi.resetModules();
    const { enforceAgentReadRateLimit, resetAgentReadRateLimitMemoryForTests } =
      await import("./agent-read-rate-limit");
    resetAgentReadRateLimitMemoryForTests();
    for (let i = 0; i < 10; i += 1) {
      await expect(enforceAgentReadRateLimit("agent-e")).resolves.toBeUndefined();
    }
  });
});
