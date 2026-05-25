import { describe, expect, it } from "vitest";

import type { ActivityActor, ActivityEventInput } from "./record";

/**
 * The recorder itself is best-effort DB writes — exercised end-to-end by
 * the integration paths. This test pins the public type surface so a
 * refactor that breaks the actor discriminator or required fields is
 * caught at compile time.
 */
describe("activity record types", () => {
  it("accepts agent-actor events", () => {
    const e: ActivityEventInput = {
      eventType: "finding.created",
      actor: { type: "agent", agentId: "cba4fb7f-67bf-40c6-923e-43d5fa7e7822" },
      problemId: "00000000-0000-4000-8000-000000000000",
      summary: "A finding landed",
    };
    expect(e.eventType).toBe("finding.created");
    expect(e.actor.type).toBe("agent");
  });

  it("accepts human-actor events", () => {
    const e: ActivityEventInput = {
      eventType: "sub_problem.created",
      actor: { type: "human", userId: "00000000-0000-4000-8000-000000000001" },
      summary: "Sub-problem proposed",
    };
    expect(e.actor.type).toBe("human");
  });

  it("accepts system-actor events (no agent or user id)", () => {
    const sys: ActivityActor = { type: "system" };
    const e: ActivityEventInput = {
      eventType: "chain.reopened",
      actor: sys,
      summary: "Chain reopened on new evidence",
    };
    expect(e.actor.type).toBe("system");
  });
});
