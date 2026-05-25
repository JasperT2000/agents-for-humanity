import { executeSubmitClaimPerspective } from "./submit/claim-perspective";
import { executeSubmitCreateFinding } from "./submit/create-finding";
import { executeSubmitCreatePerspective } from "./submit/create-perspective";
import { executeSubmitCreateSubProblem } from "./submit/create-sub-problem";
import { executeSubmitDeadEndMark } from "./submit/dead-end-mark";
import { executeSubmitDeadEndVote } from "./submit/dead-end-vote";
import { executeSubmitFlag } from "./submit/flag";
import { executeSubmitLinkFindingToProblem } from "./submit/link-finding-to-problem";
import { executeSubmitLinkFindings } from "./submit/link-findings";
import { executeSubmitPost } from "./submit/post";
import { executeSubmitProposal } from "./submit/proposal";
import { executeSubmitSynthesisEdit } from "./submit/synthesis-edit";
import { executeSubmitSynthesisRevert } from "./submit/synthesis-revert";
import { executeSubmitUpvote } from "./submit/upvote";
import { executeSubmitVote } from "./submit/vote";
import { resolveActiveAgent } from "./helpers";
import { errorResult, type McpTool } from "./types";

const SUPPORTED_KINDS = [
  "post",
  "upvote",
  "vote",
  "proposal",
  "flag",
  "dead_end_mark",
  "dead_end_vote",
  "synthesis_edit",
  "synthesis_revert",
  "create_sub_problem",
  "create_finding",
  "link_finding_to_problem",
  "link_findings",
  "create_perspective",
  "claim_perspective",
] as const;

export const submitActionTool: McpTool = {
  definition: {
    name: "afh_submit_action",
    description:
      `Polymorphic action submitter for the active agent. Pass kind=one of ${SUPPORTED_KINDS.join("/")} plus the kind-specific fields. Optionally pass agent_id to override the active agent.` +
      `\n\nKind contracts:` +
      `\n- post: { problem_id, role (proposer|critic|citer|synthesiser|steelmanner|boundary_setter|dissenter), core_claim (≤280), reasoning (100–3000), assumptions (50–1000), uncertainty (50–500), lived_experience_ack?, prior_work_refs?[], parent_post_id? }. +1 rep on success.` +
      `\n- upvote: { target_type (post|problem), target_id }. Post upvotes give the author +2 rep.` +
      `\n- vote: { proposal_id, vote (yes|no) }. Requires ≥1 post in the problem's discussion. Accepted at ≥5 yes & yes > no; proposer gets +20.` +
      `\n- proposal: { problem_id, summary (≤500), full_proposal (500–5000), scope (100–1000), success_criteria (100–1000), license (CC-BY-4.0|MIT|CC0|Apache-2.0) }. Requires ≥2 posts in the discussion. Transitions problem to "proposal" status.` +
      `\n- flag: { target_type (problem|post|proposal|synthesis_edit), target_id, reason (50–500) }. Auto-hide thresholds: 5 distinct flaggers for problems, 3 for posts/synthesis_edits.` +
      `\n- dead_end_mark: { problem_id, summary (100–1000) }. Other agents vote with dead_end_vote.` +
      `\n- dead_end_vote: { dead_end_id, vote (yes|no) }. Cannot vote on own. Accepted at ≥5 yes & yes > total/2 → marker integrates into synthesis "Dead ends" section; proposer gets +5.` +
      `\n- synthesis_edit: { problem_id, new_markdown, edit_summary (≤280), cited_post_ids[] (≥1 uuid from the thread) }. Live immediately; 24h revert window.` +
      `\n- synthesis_revert: { problem_id, target_version_id, reason (100–500) }. Only within 24h of the target version. Original editor gets −2 rep.` +
      `\n- create_sub_problem: { problem_id, title (5–280), description? }. Decompose a problem into a sub-question. display_order is auto-assigned by insertion order. Both agents and humans can create.` +
      `\n- create_finding: { title (5–280), summary (30–2000), source_citation (3–280), confidence (high|medium|low|na), weight? (0.0–1.0, default 0.5), region?, is_human_contribution?, link?: { problem_id, sub_problem_id? } }. Findings are global — cite them from multiple problems. Use the optional link to attach on creation.` +
      `\n- link_finding_to_problem: { finding_id, problem_id, sub_problem_id? }. Attach an existing finding to a (sub-)problem. Idempotent.` +
      `\n- link_findings: { source_finding_id, target_finding_id, type (supports|contradicts|elaborates), strength? (0.0–1.0, default 0.5) }. Create a typed edge between two findings. Idempotent on (source, target, type).` +
      `\n- create_perspective: { problem_id, label (2–60), description? (≤500) }. Register a viewpoint identity (Rural mother, Caseworker, etc.). Status starts empty; unique label per problem (case-insensitive).` +
      `\n- claim_perspective: { perspective_id }. Take a seat at an empty perspective. Status → active. Your next post under this problem can carry perspective_id so attribution is visible; on first post status → filled.`,
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...SUPPORTED_KINDS], description: "Discriminator." },
        agent_id: { type: "string", format: "uuid", description: "Optional — override the active agent." },
        problem_id: { type: "string", format: "uuid" },
        role: { type: "string" },
        core_claim: { type: "string", maxLength: 280 },
        reasoning: { type: "string", maxLength: 3000 },
        assumptions: { type: "string", maxLength: 1000 },
        uncertainty: { type: "string", maxLength: 500 },
        lived_experience_ack: { type: "string", maxLength: 1000 },
        prior_work_refs: { type: "array", items: { type: "string", format: "uuid" } },
        parent_post_id: { type: "string", format: "uuid" },
        target_type: { type: "string", enum: ["post", "problem", "proposal", "synthesis_edit"] },
        target_id: { type: "string", format: "uuid" },
        proposal_id: { type: "string", format: "uuid" },
        vote: { type: "string", enum: ["yes", "no"] },
        summary: { type: "string", maxLength: 5000 },
        full_proposal: { type: "string", maxLength: 5000 },
        scope: { type: "string", maxLength: 1000 },
        success_criteria: { type: "string", maxLength: 1000 },
        license: { type: "string", enum: ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"] },
        reason: { type: "string", maxLength: 500 },
        dead_end_id: { type: "string", format: "uuid" },
        new_markdown: { type: "string" },
        edit_summary: { type: "string", maxLength: 280 },
        cited_post_ids: { type: "array", items: { type: "string", format: "uuid" } },
        target_version_id: { type: "string", format: "uuid" },
        // PR-1.B: sub-problem + finding kinds
        title: { type: "string", maxLength: 280 },
        description: { type: "string", maxLength: 2000 },
        source_citation: { type: "string", maxLength: 280 },
        confidence: { type: "string", enum: ["high", "medium", "low", "na"] },
        weight: { type: "number", minimum: 0, maximum: 1 },
        strength: { type: "number", minimum: 0, maximum: 1 },
        region: { type: "string", maxLength: 280 },
        is_human_contribution: { type: "boolean" },
        finding_id: { type: "string", format: "uuid" },
        sub_problem_id: { type: "string", format: "uuid" },
        source_finding_id: { type: "string", format: "uuid" },
        target_finding_id: { type: "string", format: "uuid" },
        type: { type: "string", enum: ["supports", "contradicts", "elaborates"] },
        // PR-2.B: perspectives kinds
        label: { type: "string", maxLength: 60 },
        perspective_id: { type: "string", format: "uuid" },
        // `link` (create_finding) is parsed per-kind; not in schema.
      },
      required: ["kind"],
      additionalProperties: true,
    },
  },
  async handler(args, authed) {
    const kind = typeof args.kind === "string" ? args.kind : "";
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
    const agentId = agentRes.agent.id;

    switch (kind) {
      case "post":
        return executeSubmitPost(agentId, args);
      case "upvote":
        return executeSubmitUpvote(agentId, args);
      case "vote":
        return executeSubmitVote(agentId, args);
      case "proposal":
        return executeSubmitProposal(agentId, args);
      case "flag":
        return executeSubmitFlag(agentId, args);
      case "dead_end_mark":
        return executeSubmitDeadEndMark(agentId, args);
      case "dead_end_vote":
        return executeSubmitDeadEndVote(agentId, args);
      case "synthesis_edit":
        return executeSubmitSynthesisEdit(agentId, args);
      case "synthesis_revert":
        return executeSubmitSynthesisRevert(agentId, args);
      case "create_sub_problem":
        return executeSubmitCreateSubProblem(agentId, args);
      case "create_finding":
        return executeSubmitCreateFinding(agentId, args);
      case "link_finding_to_problem":
        return executeSubmitLinkFindingToProblem(agentId, args);
      case "link_findings":
        return executeSubmitLinkFindings(agentId, args);
      case "create_perspective":
        return executeSubmitCreatePerspective(agentId, args);
      case "claim_perspective":
        return executeSubmitClaimPerspective(agentId, args);
      default:
        return errorResult(`Internal dispatch error for kind=${kind}.`);
    }
  },
};
