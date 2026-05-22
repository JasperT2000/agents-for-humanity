import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { causes } from "@/db/schema";
import { unsubscribeAgentFromCause } from "@/lib/human/cause-subscriptions";

import { isUuid, resolveActiveAgent } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const unsubscribeCauseTool: McpTool = {
  definition: {
    name: "afh_unsubscribe_cause",
    description:
      "Remove the active agent's subscription to one cause. Pass cause_id (uuid) or cause_slug. Optional agent_id overrides the active agent.",
    inputSchema: {
      type: "object",
      properties: {
        cause_id: { type: "string", format: "uuid", description: "UUID of the cause." },
        cause_slug: { type: "string", description: "Slug of the cause (e.g. \"climate\")." },
        agent_id: {
          type: "string",
          format: "uuid",
          description: "Optional — override the active agent.",
        },
      },
      additionalProperties: false,
    },
  },
  async handler(args, authed) {
    const causeIdArg = typeof args.cause_id === "string" ? args.cause_id : null;
    const causeSlugArg = typeof args.cause_slug === "string" ? args.cause_slug : null;
    const agentIdOverride = typeof args.agent_id === "string" ? args.agent_id : null;

    if (!causeIdArg && !causeSlugArg) return errorResult("Pass either cause_id or cause_slug.");

    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    let causeId: string;
    let causeName: string;
    if (causeIdArg) {
      if (!isUuid(causeIdArg)) return errorResult("cause_id must be a UUID.");
      const cause = await db.query.causes.findFirst({
        where: eq(causes.id, causeIdArg),
        columns: { id: true, name: true },
      });
      if (!cause) return errorResult(`No cause with id=${causeIdArg}.`);
      causeId = cause.id;
      causeName = cause.name;
    } else {
      const cause = await db.query.causes.findFirst({
        where: eq(causes.slug, causeSlugArg!),
        columns: { id: true, name: true },
      });
      if (!cause) return errorResult(`No cause with slug="${causeSlugArg}".`);
      causeId = cause.id;
      causeName = cause.name;
    }

    const agentRes = await resolveActiveAgent(authed.user.id, agentIdOverride);
    if ("error" in agentRes) {
      const map: Record<string, string> = {
        NO_AGENTS: "You have no agents.",
        MULTIPLE_AGENTS_NO_DEFAULT: "Multiple agents but no default. Call afh_set_active_agent or pass agent_id.",
        AGENT_NOT_FOUND: "agent_id is not one of yours.",
        AGENT_DEREGISTERED: "That agent has been deregistered.",
      };
      return errorResult(map[agentRes.error] ?? `Cannot resolve agent (${agentRes.error}).`);
    }
    const agent = agentRes.agent;

    try {
      const result = await unsubscribeAgentFromCause({
        agentId: agent.id,
        ownerUserId: authed.user.id,
        causeId,
      });
      return textResult(
        result.removed
          ? `Agent "${agent.displayName}" unsubscribed from ${causeName}.`
          : `Agent "${agent.displayName}" was not subscribed to ${causeName}; no change.`,
        {
          agent_id: agent.id,
          cause_id: causeId,
          cause_name: causeName,
          removed: result.removed,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResult(`Unsubscribe failed: ${message}`);
    }
  },
};
