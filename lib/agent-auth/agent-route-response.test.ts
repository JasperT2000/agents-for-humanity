import { describe, expect, it } from "vitest";

import { agentRouteErrorResponse } from "./agent-route-response";

describe("agentRouteErrorResponse", () => {
  it("maps known agent API errors to status codes", () => {
    expect(agentRouteErrorResponse(new Error("AGENT_UNAUTHORIZED")).status).toBe(401);
    expect(agentRouteErrorResponse(new Error("AGENT_FORBIDDEN")).status).toBe(403);
    expect(agentRouteErrorResponse(new Error("DATABASE_UNAVAILABLE")).status).toBe(503);
    expect(agentRouteErrorResponse(new Error("RATE_LIMIT_EXCEEDED")).status).toBe(429);
  });

  it("defaults unknown errors to 500", () => {
    expect(agentRouteErrorResponse(new Error("SOMETHING_ELSE")).status).toBe(500);
  });
});
