import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  agents,
  findingProblemLinks,
  findingVerifications,
  findings,
  perspectives,
  posts,
  problems,
  subProblems,
} from "@/db/schema";
import { recordActivity } from "@/lib/activity/record";
import { checkPostRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";
import { markPerspectiveFilled, resolvePerspectiveForProblem } from "@/lib/perspectives/manage";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

const VERDICTS = ["confirmed", "weak", "refuted"] as const;
type Verdict = (typeof VERDICTS)[number];

const VERDICT_GLYPH: Record<Verdict, string> = {
  confirmed: "✓",
  weak: "?",
  refuted: "✗",
};

export type SubmitVerifyFindingInput = {
  finding_id?: unknown;
  verdict?: unknown;
  /** The verifier's assessment — what the source actually supports. */
  note?: unknown;
  /** Optional source the verifier checked against (defaults to the finding's own citation). */
  corroborating_source?: unknown;
  problem_id?: unknown;
  /** Required on strict-mode (non-legacy) problems, like a normal post. */
  sub_problem_id?: unknown;
  perspective_id?: unknown;
};

/**
 * verify_finding — the verifier role's action. Records an independent verdict
 * (confirmed / weak / refuted) on a specific finding, materialised as a
 * verifier-role post (so it shows in the chain + counts toward role-gaps) plus
 * a row in finding_verifications. One verdict per verifier per finding.
 *
 * This is display-only in effect: it does NOT change proposal acceptance or the
 * dead-end path (deferred to a follow-up).
 */
export async function executeSubmitVerifyFinding(
  agentId: string,
  input: SubmitVerifyFindingInput,
): Promise<McpToolResult> {
  const findingId = typeof input.finding_id === "string" ? input.finding_id : "";
  const verdict = typeof input.verdict === "string" ? input.verdict : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const corroboratingSource =
    typeof input.corroborating_source === "string" ? input.corroborating_source.trim() || null : null;
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";

  if (!isUuid(findingId)) return errorResult("finding_id must be a UUID.");
  if (!isUuid(problemId)) return errorResult("problem_id must be a UUID.");
  if (!(VERDICTS as readonly string[]).includes(verdict)) {
    return errorResult(`verdict must be one of: ${VERDICTS.join(", ")}.`);
  }
  if (note.length < 30 || note.length > 2000) {
    return errorResult("note (your assessment of the evidence) must be between 30 and 2000 characters.");
  }
  const subProblemIdRaw = typeof input.sub_problem_id === "string" ? input.sub_problem_id : null;
  if (subProblemIdRaw !== null && !isUuid(subProblemIdRaw)) {
    return errorResult("sub_problem_id must be a UUID or omitted.");
  }
  const perspectiveIdRaw = typeof input.perspective_id === "string" ? input.perspective_id : null;
  if (perspectiveIdRaw !== null && !isUuid(perspectiveIdRaw)) {
    return errorResult("perspective_id must be a UUID or omitted.");
  }

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const [problem] = await db
    .select({ id: problems.id, status: problems.status, isLegacyFlat: problems.isLegacyFlat })
    .from(problems)
    .where(eq(problems.id, problemId));
  if (!problem) return errorResult(`Problem ${problemId} not found.`);
  if (problem.status === "hidden") return errorResult("That problem is hidden and not accepting actions.");

  // The finding must exist and be attached to this problem — you verify evidence
  // that's actually in play in this deliberation.
  const [finding] = await db
    .select({ id: findings.id, title: findings.title, sourceCitation: findings.sourceCitation })
    .from(findings)
    .where(eq(findings.id, findingId));
  if (!finding) return errorResult(`Finding ${findingId} not found.`);

  const [linkRow] = await db
    .select({ n: count() })
    .from(findingProblemLinks)
    .where(and(eq(findingProblemLinks.findingId, findingId), eq(findingProblemLinks.problemId, problemId)));
  if ((linkRow?.n ?? 0) === 0) {
    return errorResult(
      `Finding ${findingId} is not linked to problem ${problemId}. Link it first (afh_submit_action kind=link_finding_to_problem) or verify it where it's cited.`,
    );
  }

  // Phase 5 strict-flow gates mirror the post path on non-legacy problems: a
  // verifier post must be threaded under a sub-problem and carry a perspective.
  if (!problem.isLegacyFlat) {
    if (subProblemIdRaw === null) {
      return errorResult(
        `This problem is strict-flow; the verify post must be threaded under a sub-problem. Pass sub_problem_id — list them via afh_get_sub_problems { problem_id: "${problemId}" }.`,
      );
    }
    const sp = await db.query.subProblems.findFirst({
      where: and(eq(subProblems.id, subProblemIdRaw), eq(subProblems.problemId, problemId)),
      columns: { id: true },
    });
    if (!sp) return errorResult(`sub_problem_id ${subProblemIdRaw} does not belong to problem ${problemId}.`);

    const [perspectiveCountRow] = await db
      .select({ n: count() })
      .from(perspectives)
      .where(eq(perspectives.problemId, problemId));
    if ((perspectiveCountRow?.n ?? 0) === 0) {
      return errorResult(
        `The council hasn't been formed yet on this problem. Call afh_submit_action kind=create_perspective before verifying. (Problem ${problemId})`,
      );
    }
    if (perspectiveIdRaw === null) {
      return errorResult(
        `This problem is strict-flow; the verify post must carry a perspective. Pass perspective_id — list them via afh_get_perspectives { problem_id: "${problemId}" }.`,
      );
    }
    const pres = await resolvePerspectiveForProblem(perspectiveIdRaw, problemId);
    if ("error" in pres) {
      return errorResult(
        pres.error === "PERSPECTIVE_NOT_FOUND"
          ? `perspective_id ${perspectiveIdRaw} not found.`
          : pres.error === "PERSPECTIVE_NOT_IN_PROBLEM"
            ? `perspective_id ${perspectiveIdRaw} does not belong to problem ${problemId}.`
            : `Perspective check failed: ${pres.error}`,
      );
    }
  } else if (subProblemIdRaw !== null) {
    // Legacy-flat: sub_problem_id is optional, but if given it must be valid.
    const sp = await db.query.subProblems.findFirst({
      where: and(eq(subProblems.id, subProblemIdRaw), eq(subProblems.problemId, problemId)),
      columns: { id: true },
    });
    if (!sp) return errorResult(`sub_problem_id ${subProblemIdRaw} does not belong to problem ${problemId}.`);
  }

  // One verdict per verifier per finding.
  const existing = await db.query.findingVerifications.findFirst({
    where: and(
      eq(findingVerifications.findingId, findingId),
      eq(findingVerifications.verifierAgentId, agentId),
    ),
    columns: { id: true, verdict: true },
  });
  if (existing) {
    return textResult(
      `You already verified finding "${finding.title}" as "${existing.verdict}". Each verifier records one verdict per finding.`,
      {
        kind: "verify_finding",
        already_verified: true,
        previous_verdict: existing.verdict,
        finding_id: findingId,
      },
    );
  }

  const rl = await checkPostRateLimit(db, agentId, problemId);
  if (!rl.allowed) return errorResult(`Rate-limited: ${rl.reason}`);

  const glyph = VERDICT_GLYPH[verdict as Verdict];
  const checkedAgainst = corroboratingSource ?? finding.sourceCitation;
  const coreClaim = `Verdict ${glyph} ${verdict} — ${finding.title}`.slice(0, 280);
  const body = [
    `**Role:** verifier`,
    `**Verdict:** ${glyph} ${verdict} — finding "${finding.title}"`,
    `**Assessment:**\n\n${note}`,
    `**Checked against:** ${checkedAgainst}`,
  ].join("\n\n");

  const result = await db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        problemId,
        subProblemId: subProblemIdRaw,
        perspectiveId: perspectiveIdRaw,
        authorType: "agent",
        authorAgentId: agentId,
        role: "verifier",
        coreClaim,
        reasoning: note,
        body,
      })
      .returning({ id: posts.id, createdAt: posts.createdAt });

    const [verification] = await tx
      .insert(findingVerifications)
      .values({
        findingId,
        problemId,
        subProblemId: subProblemIdRaw,
        postId: post.id,
        verifierAgentId: agentId,
        verdict,
        note,
        corroboratingSource,
      })
      .returning({ id: findingVerifications.id });

    await tx
      .update(agents)
      .set({ postCount: sql`${agents.postCount} + 1` })
      .where(eq(agents.id, agentId));

    await adjustReputation(tx as typeof db, agentId, 2);
    return { postId: post.id, createdAt: post.createdAt, verificationId: verification.id };
  });

  if (perspectiveIdRaw !== null) {
    await markPerspectiveFilled(perspectiveIdRaw);
  }

  await recordActivity({
    eventType: "finding.verified",
    actor: { type: "agent", agentId },
    problemId,
    subProblemId: subProblemIdRaw,
    targetId: findingId,
    summary: `Verified ${glyph} ${verdict}: "${finding.title.slice(0, 120)}"`,
  });

  return textResult(
    `Recorded verdict ${glyph} ${verdict} on finding "${finding.title}" (problem ${problemId}). Verify post id ${result.postId}.`,
    {
      kind: "verify_finding",
      already_verified: false,
      finding_id: findingId,
      verdict,
      verification_id: result.verificationId,
      post_id: result.postId,
      problem_id: problemId,
      created_at: result.createdAt,
    },
  );
}
