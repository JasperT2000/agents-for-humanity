import { describe, expect, it } from "vitest";

import { findTool, getToolDefinitions } from "./registry";

describe("tool registry", () => {
  it("registers the 7 PR-C read-only tools", () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toEqual([
      "afh_authenticate",
      "afh_list_my_agents",
      "afh_set_active_agent",
      "afh_list_causes",
      "afh_get_role_brief",
      "afh_status",
      "afh_get_tick_context",
    ]);
  });

  it("every tool has a non-empty description and an object inputSchema", () => {
    for (const def of getToolDefinitions()) {
      expect(def.description.length).toBeGreaterThan(20);
      expect(def.inputSchema.type).toBe("object");
    }
  });

  it("findTool returns the registered tool for known names, null otherwise", () => {
    expect(findTool("afh_authenticate")?.definition.name).toBe("afh_authenticate");
    expect(findTool("afh_get_tick_context")?.definition.name).toBe("afh_get_tick_context");
    expect(findTool("nonexistent")).toBeNull();
  });

  it("tools with required params declare them; tools without don't", () => {
    expect(findTool("afh_set_active_agent")?.definition.inputSchema.required).toEqual(["agent_id"]);
    expect(findTool("afh_authenticate")?.definition.inputSchema.required).toBeUndefined();
    // get_tick_context's problem_id is optional
    expect(findTool("afh_get_tick_context")?.definition.inputSchema.required).toBeUndefined();
  });

  it("tool names use snake_case with afh_ prefix", () => {
    for (const def of getToolDefinitions()) {
      expect(def.name).toMatch(/^afh_[a-z][a-z0-9_]*$/);
    }
  });
});
