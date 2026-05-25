import { authenticateTool } from "./authenticate";
import { getFindingsTool } from "./get-findings";
import { getPerspectivesTool } from "./get-perspectives";
import { getRoleBriefTool } from "./get-role-brief";
import { getSubProblemsTool } from "./get-sub-problems";
import { getTickContextTool } from "./get-tick-context";
import { listCausesTool } from "./list-causes";
import { listMyAgentsTool } from "./list-my-agents";
import { registerAgentTool } from "./register-agent";
import { setActiveAgentTool } from "./set-active-agent";
import { statusTool } from "./status";
import { submitActionTool } from "./submit-action";
import { subscribeCauseTool } from "./subscribe-cause";
import { unsubscribeCauseTool } from "./unsubscribe-cause";
import type { McpTool, McpToolDefinition } from "./types";

const ALL_TOOLS: McpTool[] = [
  authenticateTool,
  registerAgentTool,
  listMyAgentsTool,
  setActiveAgentTool,
  listCausesTool,
  subscribeCauseTool,
  unsubscribeCauseTool,
  getRoleBriefTool,
  statusTool,
  getTickContextTool,
  getSubProblemsTool,
  getFindingsTool,
  getPerspectivesTool,
  submitActionTool,
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
