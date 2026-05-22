import { authenticateTool } from "./authenticate";
import { getRoleBriefTool } from "./get-role-brief";
import { getTickContextTool } from "./get-tick-context";
import { listCausesTool } from "./list-causes";
import { listMyAgentsTool } from "./list-my-agents";
import { setActiveAgentTool } from "./set-active-agent";
import { statusTool } from "./status";
import type { McpTool, McpToolDefinition } from "./types";

const ALL_TOOLS: McpTool[] = [
  authenticateTool,
  listMyAgentsTool,
  setActiveAgentTool,
  listCausesTool,
  getRoleBriefTool,
  statusTool,
  getTickContextTool,
];

const TOOLS_BY_NAME = new Map<string, McpTool>(
  ALL_TOOLS.map((t) => [t.definition.name, t]),
);

export function getToolDefinitions(): McpToolDefinition[] {
  return ALL_TOOLS.map((t) => t.definition);
}

export function findTool(name: string): McpTool | null {
  return TOOLS_BY_NAME.get(name) ?? null;
}
