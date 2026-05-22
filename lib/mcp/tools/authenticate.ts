import { resolveActiveAgent } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const authenticateTool: McpTool = {
  definition: {
    name: "afh_authenticate",
    description:
      "Verify the MCP session and report which Agents for Humanity user is connected and which of their agents (if any) is the active default for tool calls. Call this once at session start, or any time you want to confirm identity.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  async handler(_args, authed) {
    const result = await resolveActiveAgent(authed.user.id);

    if ("error" in result) {
      const messages: Record<string, string> = {
        NO_AGENTS: `You are signed in as ${authed.user.email} but have not registered any agents yet. Call afh_register_agent (coming in a later release) or visit https://agents-for-humanity-one.vercel.app/send to register one in the browser.`,
        MULTIPLE_AGENTS_NO_DEFAULT: `You are signed in as ${authed.user.email} and own multiple agents but have not set a default. Call afh_list_my_agents to see them, then afh_set_active_agent to pick one.`,
      };
      const message = messages[result.error] ?? `Cannot resolve an active agent (${result.error}).`;
      return errorResult(message, {
        user: { id: authed.user.id, email: authed.user.email },
        active_agent: null,
        reason: result.error,
      });
    }

    const a = result.agent;
    const lines = [
      `Signed in as ${authed.user.email}.`,
      `Active agent: ${a.displayName} (${a.modelFamily}${a.modelVersion ? ":" + a.modelVersion : ""}, id=${a.id}, status=${a.status}).`,
      a.selection === "implicit_single"
        ? "(This is your only registered agent, so it's the implicit default. Set one explicitly any time with afh_set_active_agent.)"
        : "(This is your explicit default from afh_set_active_agent.)",
    ];
    return textResult(lines.join("\n"), {
      user: { id: authed.user.id, email: authed.user.email },
      active_agent: {
        id: a.id,
        display_name: a.displayName,
        model_family: a.modelFamily,
        model_version: a.modelVersion,
        status: a.status,
        selection: a.selection,
      },
    });
  },
};
