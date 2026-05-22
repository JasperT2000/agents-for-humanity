import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { causes } from "@/db/schema";
import {
  MAX_SUBSCRIPTIONS_PER_AGENT,
  subscribeAgentToCauses,
} from "@/lib/human/cause-subscriptions";

import { isUuid, resolveActiveAgent } from "./helpers";
import { errorResult, textResult, type McpTool } from "./types";

export const subscribeCauseTool: McpTool = {
  definition: {
    name: "afh_subscribe_cause",
    description: `Subscribe the active agent to a cause so it sees that cause's problems in afh_get_tick_context. Pass either cause_id (uuid from afh_list_causes) or cause_slug (e.g. "climate"). Idempotent — already-subscribed causes are reported but don't fail. An agent can subscribe to at most ${MAX_SUBSCRIPTIONS_PER_AGENT} causes.`,
    inputSchema: {
      type: "object",
      properties: {
        cause_id: { type: "string", format: "uuid", description: "UUID of the cause (from afh_list_causes)." },
        cause_slug: { type: "string", description: "Slug of the cause (e.g. \"climate\"). Convenient alternative to cause_id." },
        agent_id: {
          type: "string",
          format: "uuid",
          description: "Optional — override the active agent (the resolved agent must be owned by the signed-in user).",
        },
      },
      additionalProperties: false,
    },
  },
  async handler(args, authed) {
    const causeIdArg = typeof args.cause_id === "string" ? args.cause_id : null;
    const causeSlugArg = typeof args.cause_slug === "string" ? args.cause_slug : null;
    const agentIdOverride = typeof args.agent_id === "string" ? args.agent_id : null;

    if (!causeIdArg && !causeSlugArg) {
      return errorResult("Pass either cause_id or cause_slug. Call afh_list_causes to see options.");
    }

    const db = getDb();
    if (!db) return errorResult("Database is temporarily unavailable.");

    // Resolve cause_slug -> cause_id if needed.
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
      if (!cause) return errorResult(`No cause with slug="${causeSlugArg}". Use afh_list_causes to see slugs.`);
      causeId = cause.id;
      causeName = cause.name;
    }

    const agentRes = await resolveActiveAgent(authed.user.id, agentIdOverride);
    if ("error" in agentRes) {
      const map: Record<string, string> = {
        NO_AGENTS: "You have no agents to subscribe. Call afh_register_agent first.",
        MULTIPLE_AGENTS_NO_DEFAULT: "Multiple agents but no default. Call afh_set_active_agent or pass agent_id.",
        AGENT_NOT_FOUND: "That agent_id is not one of yours.",
        AGENT_DEREGISTERED: "That agent has been deregistered.",
      };
      return errorResult(map[agentRes.error] ?? `Cannot resolve agent (${agentRes.error}).`);
    }
    const agent = agentRes.agent;

    try {
      const results = await subscribeAgentToCauses({
        agentId: agent.id,
        ownerUserId: authed.user.id,
        causeIds: [causeId],
      });
      const r = results[0];
      const message = r.status === "subscribed"
        ? `Agent "${agent.displayName}" subscribed to ${causeName}.`
        : r.status === "already_subscribed"
          ? `Agent "${agent.displayName}" was already subscribed to ${causeName}.`
          : `Cause not found (${causeId}).`;
      return textResult(message, {
        agent_id: agent.id,
        cause_id: causeId,
        cause_name: causeName,
        status: r.status,
        subscription_id: r.subscriptionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const friendly: Record<string, string> = {
        SUBSCRIPTION_LIMIT_EXCEEDED: `An agent can subscribe to at most ${MAX_SUBSCRIPTIONS_PER_AGENT} causes. Unsubscribe from one before adding another.`,
        AGENT_NOT_FOUND: "Resolved agent is not owned by you (this shouldn't happen — please report).",
        AGENT_DEREGISTERED: "Resolved agent has been deregistered.",
      };
      return errorResult(friendly[message] ?? `Subscribe failed: ${message}`);
    }
  },
};
