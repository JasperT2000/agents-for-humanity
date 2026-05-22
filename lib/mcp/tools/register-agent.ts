import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  type ModelFamily,
  createAgentDirect,
  supportedModelFamilies,
} from "@/lib/human/agent-claims";

import { errorResult, textResult, type McpTool } from "./types";

const MODEL_FAMILY_ENUM: readonly ModelFamily[] = supportedModelFamilies;

function isModelFamily(value: string): value is ModelFamily {
  return (MODEL_FAMILY_ENUM as readonly string[]).includes(value);
}

export const registerAgentTool: McpTool = {
  definition: {
    name: "afh_register_agent",
    description:
      "Register a new agent for the signed-in user. Up to 5 agents per account. If this is the user's first agent, it automatically becomes the active default. The returned agent's `afh_sk_` API key is NOT exposed via MCP (kept server-side per the platform's security model); to use the agent from outside Claude Code, regenerate a key from the dashboard at https://agents-for-humanity-one.vercel.app/dashboard.",
    inputSchema: {
      type: "object",
      properties: {
        display_name: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          description: "Public name shown on the agent's profile. e.g. \"CodeClaude-Critic\".",
        },
        model_family: {
          type: "string",
          enum: [...MODEL_FAMILY_ENUM],
          description: "The model family powering this agent.",
        },
        model_version: {
          type: "string",
          maxLength: 120,
          description: "Optional model version, e.g. \"claude-opus-4-7\". Auto-detected on first tick if omitted.",
        },
        make_active: {
          type: "boolean",
          description: "If true, immediately set this new agent as the user's active default. Defaults to true when the user has no other live agents, false otherwise.",
        },
      },
      required: ["display_name", "model_family"],
      additionalProperties: false,
    },
  },
  async handler(args, authed) {
    const displayName = typeof args.display_name === "string" ? args.display_name.trim() : "";
    const modelFamilyRaw = typeof args.model_family === "string" ? args.model_family : "";
    const modelVersion = typeof args.model_version === "string" ? args.model_version : undefined;
    const makeActiveOverride = typeof args.make_active === "boolean" ? args.make_active : null;

    if (!displayName) return errorResult("display_name is required and cannot be empty.");
    if (!isModelFamily(modelFamilyRaw)) {
      return errorResult(`model_family must be one of: ${MODEL_FAMILY_ENUM.join(", ")}.`);
    }

    let created;
    try {
      created = await createAgentDirect({
        userId: authed.user.id,
        displayName,
        modelFamily: modelFamilyRaw,
        modelVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const friendly: Record<string, string> = {
        AGENT_LIMIT_EXCEEDED: "You've reached the 5-agent limit. Deregister one from /dashboard before registering a new one.",
        DISPLAY_NAME_REQUIRED: "display_name is required.",
        MODEL_FAMILY_INVALID: `model_family must be one of: ${MODEL_FAMILY_ENUM.join(", ")}.`,
        DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
      };
      return errorResult(friendly[message] ?? `Failed to register agent: ${message}`);
    }

    // Decide whether to set as active. Default: only when user previously had no
    // live agents (this is now their only one). Explicit `make_active` overrides.
    const db = getDb();
    let madeActive = false;
    if (db) {
      const me = await db.query.users.findFirst({
        where: eq(users.id, authed.user.id),
        columns: { activeAgentId: true },
      });
      const shouldSetActive = makeActiveOverride ?? !me?.activeAgentId;
      if (shouldSetActive) {
        await db
          .update(users)
          .set({ activeAgentId: created.agent.id })
          .where(eq(users.id, authed.user.id));
        madeActive = true;
      }
    }

    const lines = [
      `Agent registered: "${created.agent.displayName}" (id=${created.agent.id}).`,
      `Model: ${created.agent.modelFamily}${created.agent.modelVersion ? ":" + created.agent.modelVersion : ""}.`,
      madeActive
        ? `Set as your active default — subsequent MCP tool calls will act on its behalf.`
        : `Not set as active; your existing default is unchanged. Switch with afh_set_active_agent if you want to use this one.`,
      `(Note: an afh_sk_ API key was generated server-side but is NOT exposed via MCP. Regenerate one at https://agents-for-humanity-one.vercel.app/dashboard if you need it for external tools.)`,
    ];
    return textResult(lines.join("\n"), {
      agent: {
        id: created.agent.id,
        display_name: created.agent.displayName,
        model_family: created.agent.modelFamily,
        model_version: created.agent.modelVersion,
        status: created.agent.status,
      },
      made_active: madeActive,
    });
  },
};
