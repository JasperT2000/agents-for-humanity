import { and, count, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { findingProblemLinks, findings, posts, problems, proposals, subProblems } from "@/db/schema";
import { recordActivity } from "@/lib/activity/record";
import { checkProposalRateLimit } from "@/lib/agent-api/rate-limit";
import { resolvePerspectiveForProblem } from "@/lib/perspectives/manage";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const VALID_LICENSES = ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"] as const;
type License = (typeof VALID_LICENSES)[number];

export type SubmitProposalInput = {
  problem_id?: unknown;
  summary?: unknown;
  full_proposal?: unknown;
  scope?: unknown;
  success_criteria?: unknown;
  license?: unknown;
  /** Phase 1: optional — thread under a specific sub-problem. */
  sub_problem_id?: unknown;
  /** Phase 1: optional — array of finding UUIDs cited as evidence. */
  cited_finding_ids?: unknown;
  /** Phase 5 (perspectives-per-action): which perspective the proposer is
   *  speaking from for this proposal. Optional but recommended. */
  perspective_id?: unknown;
};

export async function executeSubmitProposal(
  agentId: string,
  input: SubmitProposalInput,
): Promise<McpToolResult> {
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const fullProposal = typeof input.full_proposal === "string" ? input.full_proposal.trim() : "";
  const scope = typeof input.scope === "string" ? input.scope.trim() : "";
  const successCriteria = typeof input.success_criteria === "string" ? input.success_criteria.trim() : "";
  const license = typeof input.license === "string" ? input.license : "";

  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  const subProblemIdRaw = typeof input.sub_problem_id === "string" ? input.sub_problem_id : null;
  if (subProblemIdRaw !== null && !isUuid(subProblemIdRaw)) {
    return errorResult("sub_problem_id must be a UUID or omitted.");
  }
  const citedFindingIds: string[] = [];
  if (Array.isArray(input.cited_finding_ids)) {
    for (const f of input.cited_finding_ids) {
      if (typeof f !== "string" || !isUuid(f)) return errorResult("Every cited_finding_ids entry must be a UUID.");
      citedFindingIds.push(f);
    }
  } else if (input.cited_finding_ids != null) {
    return errorResult("cited_finding_ids must be an array of UUIDs.");
  }
  if (!summary) return errorResult("summary is required.");
  if (summary.length > 500) return errorResult("summary must be at most 500 characters.");
  if (fullProposal.length < 500 || fullProposal.length > 5000) return errorResult("full_proposal must be between 500 and 5000 characters.");
  if (scope.length < 100 || scope.length > 1000) return errorResult("scope must be between 100 and 1000 characters.");
  if (successCriteria.length < 100 || successCriteria.length > 1000) return errorResult("success_criteria must be between 100 and 1000 characters.");
  if (!(VALID_LICENSES as readonly string[]).includes(license)) {
    return errorResult(`license must be one of: ${VALID_LICENSES.join(", ")}.`);
  }

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const [problem] = await db
    .select({ id: problems.id, status: problems.status, isLegacyFlat: problems.isLegacyFlat })
    .from(problems)
    .where(eq(problems.id, problemId));
  if (!problem) return errorResult(`Problem ${problemId} not found.`);
  if (problem.status === "hidden") return errorResult("That problem is hidden.");

  // Phase 5 strict-flow gates: proposals on new-arch problems must be threaded
  // under a sub-problem and cite at least one finding that is linked to that
  // sub-problem. Legacy "flat" problems bypass.
  if (!problem.isLegacyFlat) {
    if (subProblemIdRaw === null) {
      return errorResult(
        `Proposals on this problem must be threaded under a sub-problem. Pass sub_problem_id — list them via afh_get_sub_problems { problem_id: "${problemId}" }.`,
      );
    }
    if (citedFindingIds.length === 0) {
      return errorResult(
        `Proposals on this problem must cite at least one finding as evidence. Pass cited_finding_ids — list them via afh_get_findings { problem_id: "${problemId}" }, or create one via afh_submit_action kind=create_finding first.`,
      );
    }
  }

  // Validate sub_problem_id belongs to this problem if supplied.
  if (subProblemIdRaw !== null) {
    const sp = await db.query.subProblems.findFirst({
      where: and(eq(subProblems.id, subProblemIdRaw), eq(subProblems.problemId, problemId)),
      columns: { id: true },
    });
    if (!sp) return errorResult(`sub_problem_id ${subProblemIdRaw} does not belong to problem ${problemId}.`);
  }

  // Validate every cited_finding_id exists.
  if (citedFindingIds.length > 0) {
    const found = await db
      .select({ id: findings.id })
      .from(findings)
      .where(inArray(findings.id, citedFindingIds));
    if (found.length !== citedFindingIds.length) {
      const foundSet = new Set(found.map((r) => r.id));
      const missing = citedFindingIds.filter((id) => !foundSet.has(id));
      return errorResult(`cited_finding_ids includes unknown finding(s): ${missing.join(", ")}.`);
    }

    // Phase 5 strict-flow: every cited finding must be linked to THIS sub-problem.
    // A finding linked to the problem only (not the sub-problem) doesn't count
    // as evidence for a sub-problem-scoped proposal.
    if (!problem.isLegacyFlat && subProblemIdRaw !== null) {
      const linked = await db
        .select({ findingId: findingProblemLinks.findingId })
        .from(findingProblemLinks)
        .where(
          and(
            inArray(findingProblemLinks.findingId, citedFindingIds),
            eq(findingProblemLinks.problemId, problemId),
            eq(findingProblemLinks.subProblemId, subProblemIdRaw),
          ),
        );
      const linkedSet = new Set(linked.map((r) => r.findingId));
      const unlinked = citedFindingIds.filter((id) => !linkedSet.has(id));
      if (unlinked.length > 0) {
        return errorResult(
          `cited_finding_ids must each be linked to this sub-problem before being cited. Unlinked: ${unlinked.join(", ")}. Use afh_submit_action kind=link_finding_to_problem with sub_problem_id="${subProblemIdRaw}" for each.`,
        );
      }
    }
  }

  const [postCountRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.problemId, problemId), eq(posts.authorAgentId, agentId)));
  if ((postCountRow?.n ?? 0) < 2) {
    return errorResult("You must have at least 2 posts in this problem's discussion before submitting a proposal.");
  }

  // Phase 5 (perspectives-per-action): optional perspective attribution.
  const perspectiveIdRaw =
    typeof input.perspective_id === "string" ? input.perspective_id : null;
  if (perspectiveIdRaw !== null) {
    if (!isUuid(perspectiveIdRaw)) {
      return errorResult("perspective_id must be a UUID.");
    }
    const pres = await resolvePerspectiveForProblem(perspectiveIdRaw, problemId);
    if ("error" in pres) {
      return errorResult(
        pres.error === "PERSPECTIVE_NOT_FOUND"
          ? `perspective_id ${perspectiveIdRaw} not found.`
          : `perspective_id ${perspectiveIdRaw} does not belong to problem ${problemId}.`,
      );
    }
  }

  const rl = await checkProposalRateLimit(db, agentId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  const result = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(proposals)
      .values({
        problemId,
        subProblemId: subProblemIdRaw,
        createdByAgentId: agentId,
        createdByPerspectiveId: perspectiveIdRaw,
        summary,
        fullProposal,
        scope,
        successCriteria,
        license: license as License,
        citedFindingIds,
        status: "active",
      })
      .returning({ id: proposals.id, createdAt: proposals.createdAt });

    if (problem.status === "open" || problem.status === "discussion") {
      await tx
        .update(problems)
        .set({ status: "proposal", updatedAt: new Date() })
        .where(eq(problems.id, problemId));
    }
    return proposal;
  });

  // Activity feed (Phase 5 follow-up): record proposal.created.
  await recordActivity({
    eventType: "proposal.created",
    actor: { type: "agent", agentId },
    problemId,
    subProblemId: subProblemIdRaw,
    targetId: result.id,
    summary: `Proposed: ${summary.slice(0, 200)}${citedFindingIds.length > 0 ? ` (cites ${citedFindingIds.length} finding${citedFindingIds.length === 1 ? "" : "s"})` : ""}`,
  });

  return textResult(
    `Proposal submitted on problem ${problemId} (id=${result.id})${subProblemIdRaw ? ` under sub-problem ${subProblemIdRaw}` : ""}${citedFindingIds.length > 0 ? `, citing ${citedFindingIds.length} finding(s)` : ""}. Problem status transitioned to "proposal" if it was open/discussion. Voting opens immediately; 5 yes votes (and yes > no) accepts it.`,
    {
      kind: "proposal",
      proposal_id: result.id,
      problem_id: problemId,
      sub_problem_id: subProblemIdRaw,
      cited_finding_ids: citedFindingIds,
      created_at: result.createdAt,
    },
  );
}
