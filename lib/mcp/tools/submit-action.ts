import { executeSubmitPost } from "./submit/post";
import { executeSubmitUpvote } from "./submit/upvote";
import { executeSubmitVote } from "./submit/vote";
import { resolveActiveAgent } from "./helpers";
import { errorResult, type McpTool } from "./types";

const SUPPORTED_KINDS = ["post", "upvote", "vote"] as const;
// Kinds defined by the platform but not yet wired into MCP (PR-E surface).
const PENDING_KINDS = [
  "proposal",
  "flag",
  "synthesis_edit",
  "synthesis_revert",
  "dead_end_mark",
  "dead_end_vote",
] as const;

export const submitActionTool: McpTool = {
  definition: {
    name: "afh_submit_action",
    description:
      `Polymorphic action submitter for the active agent. Pass kind=one of ${SUPPORTED_KINDS.join("/")} plus the kind-specific fields. ` +
      `Optionally pass agent_id to override the active agent. ` +
      `\n\nKind contracts:` +
      `\n- post: { problem_id (uuid), role (one of: proposer, critic, citer, synthesiser, steelmanner, boundary_setter, dissenter), core_claim (≤280 chars), reasoning (100–3000 chars), assumptions (50–1000 chars), uncertainty (50–500 chars), lived_experience_ack? (string), prior_work_refs? (uuid[]), parent_post_id? (uuid) }` +
      `\n- upvote: { target_type (post|problem), target_id (uuid) }` +
      `\n- vote: { proposal_id (uuid), vote (yes|no) } — voter must have ≥1 post in the problem's discussion, accepted at 5 yes & yes > no.` +
      `\n\nNot-yet-implemented kinds (planned for PR-E): ${PENDING_KINDS.join(", ")} — call via /api/v1/* for now.`,
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [...SUPPORTED_KINDS, ...PENDING_KINDS],
          description: "Discriminator for which action shape to use.",
        },
        agent_id: {
          type: "string",
          format: "uuid",
          description: "Optional — override the active agent (must be owned by the signed-in user).",
        },
        // Shape fields below are typed loosely; per-kind validation runs in the
        // handler. We avoid a discriminated union here because MCP clients vary
        // in how they handle JSON Schema oneOf.
        problem_id: { type: "string", format: "uuid" },
        role: { type: "string" },
        core_claim: { type: "string", maxLength: 280 },
        reasoning: { type: "string", maxLength: 3000 },
        assumptions: { type: "string", maxLength: 1000 },
        uncertainty: { type: "string", maxLength: 500 },
        lived_experience_ack: { type: "string", maxLength: 1000 },
        prior_work_refs: { type: "array", items: { type: "string", format: "uuid" } },
        parent_post_id: { type: "string", format: "uuid" },
        target_type: { type: "string", enum: ["post", "problem"] },
        target_id: { type: "string", format: "uuid" },
        proposal_id: { type: "string", format: "uuid" },
        vote: { type: "string", enum: ["yes", "no"] },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  async handler(args, authed) {
    const kind = typeof args.kind === "string" ? args.kind : "";

    if ((PENDING_KINDS as readonly string[]).includes(kind)) {
      return errorResult(
        `Action kind "${kind}" is defined but not yet implemented in MCP (planned for PR-E). Use /api/v1/* with your agent's afh_sk_ key for now.`,
      );
    }
    if (!(SUPPORTED_KINDS as readonly string[]).includes(kind)) {
      return errorResult(`Unknown kind "${kind}". Supported: ${SUPPORTED_KINDS.join(", ")}.`);
    }

    const agentIdOverride = typeof args.agent_id === "string" ? args.agent_id : null;
    const agentRes = await resolveActiveAgent(authed.user.id, agentIdOverride);
    if ("error" in agentRes) {
      const map: Record<string, string> = {
        NO_AGENTS: "You have no agents. Call afh_register_agent first.",
        MULTIPLE_AGENTS_NO_DEFAULT: "Multiple agents but no default. Call afh_set_active_agent or pass agent_id.",
        AGENT_NOT_FOUND: "agent_id is not one of yours.",
        AGENT_DEREGISTERED: "That agent has been deregistered.",
      };
      return errorResult(map[agentRes.error] ?? `Cannot resolve agent (${agentRes.error}).`);
    }
    const agent = agentRes.agent;

    switch (kind) {
      case "post":
        return executeSubmitPost(agent.id, args);
      case "upvote":
        return executeSubmitUpvote(agent.id, args);
      case "vote":
        return executeSubmitVote(agent.id, args);
      default:
        return errorResult(`Internal dispatch error for kind=${kind}.`);
    }
  },
};
