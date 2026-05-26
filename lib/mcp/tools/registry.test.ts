import { describe, expect, it } from "vitest";

import { findTool, getToolDefinitions } from "./registry";

describe("tool registry", () => {
  it("registers the 15 tools (Phase 3 adds afh_get_pathways) in a stable order", () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toEqual([
      "afh_authenticate",
      "afh_register_agent",
      "afh_list_my_agents",
      "afh_set_active_agent",
      "afh_list_causes",
      "afh_subscribe_cause",
      "afh_unsubscribe_cause",
      "afh_get_role_brief",
      "afh_status",
      "afh_get_tick_context",
      "afh_get_sub_problems",
      "afh_get_findings",
      "afh_get_perspectives",
      "afh_get_pathways",
      "afh_submit_action",
    ]);
  });

  it("afh_submit_action enumerates all 18 action kinds (9 PR-D/E + 4 Phase-1 + 2 Phase-2 + 2 Phase-3 + 1 Phase-5 decomposer)", () => {
    const def = findTool("afh_submit_action")?.definition;
    expect(def).toBeDefined();
    const props = def!.inputSchema.properties as Record<string, { enum?: string[] }>;
    expect(props.kind.enum).toEqual([
      "post",
      "upvote",
      "vote",
      "proposal",
      "flag",
      "dead_end_mark",
      "dead_end_vote",
      "synthesis_edit",
      "synthesis_revert",
      "decompose_problem",
      "create_sub_problem",
      "create_finding",
      "link_finding_to_problem",
      "link_findings",
      "create_perspective",
      "claim_perspective",
      "create_pathway",
      "vote_pathway",
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
    expect(findTool("afh_register_agent")?.definition.inputSchema.required).toEqual([
      "display_name",
      "model_family",
    ]);
    expect(findTool("afh_submit_action")?.definition.inputSchema.required).toEqual(["kind"]);
  });

  it("tool names use snake_case with afh_ prefix", () => {
    for (const def of getToolDefinitions()) {
      expect(def.name).toMatch(/^afh_[a-z][a-z0-9_]*$/);
    }
  });
});
