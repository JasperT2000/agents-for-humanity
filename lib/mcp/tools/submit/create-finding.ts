import {
  FINDING_CONFIDENCE_VALUES,
  type FindingConfidence,
  createFinding,
  normalizeConfidence,
} from "@/lib/findings/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitCreateFindingInput = {
  title?: unknown;
  summary?: unknown;
  source_citation?: unknown;
  confidence?: unknown;
  weight?: unknown;
  region?: unknown;
  is_human_contribution?: unknown;
  link?: unknown;
};

export async function executeSubmitCreateFinding(
  agentId: string,
  input: SubmitCreateFindingInput,
): Promise<McpToolResult> {
  const title = typeof input.title === "string" ? input.title : "";
  const summary = typeof input.summary === "string" ? input.summary : "";
  const sourceCitation = typeof input.source_citation === "string" ? input.source_citation : "";
  // Accept the legacy "na" alias; canonical is "n/a".
  const confidenceRaw = normalizeConfidence(input.confidence);
  const weight = typeof input.weight === "number" ? input.weight : undefined;
  const region = typeof input.region === "string" ? input.region : undefined;
  const isHumanContribution = typeof input.is_human_contribution === "boolean" ? input.is_human_contribution : undefined;

  if (!(FINDING_CONFIDENCE_VALUES as readonly string[]).includes(confidenceRaw)) {
    return errorResult(`confidence must be one of ${FINDING_CONFIDENCE_VALUES.join(", ")}`);
  }
  const confidence = confidenceRaw as FindingConfidence;

  let link: { problemId: string; subProblemId?: string } | undefined;
  if (input.link !== undefined && input.link !== null) {
    if (typeof input.link !== "object") return errorResult("link must be an object { problem_id, sub_problem_id? }");
    const linkObj = input.link as { problem_id?: unknown; sub_problem_id?: unknown };
    if (typeof linkObj.problem_id !== "string") return errorResult("link.problem_id is required and must be a UUID string");
    link = {
      problemId: linkObj.problem_id,
      subProblemId: typeof linkObj.sub_problem_id === "string" ? linkObj.sub_problem_id : undefined,
    };
  }

  const r = await createFinding({
    title,
    summary,
    sourceCitation,
    confidence,
    weight,
    region,
    isHumanContribution,
    createdByAgentId: agentId,
    link,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      PROBLEM_NOT_FOUND: link ? `No problem with id=${link.problemId}.` : "Problem not found.",
      SUB_PROBLEM_NOT_IN_PROBLEM: "sub_problem_id does not belong to that problem.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Finding creation failed: ${r.error}`);
  }

  const linkNote = r.link
    ? ` Linked to problem (link id=${r.link.id}${link?.subProblemId ? `, sub-problem ${link.subProblemId}` : ""}).`
    : ` Not yet linked to a problem — call afh_submit_action kind=link_finding_to_problem when you decide where it belongs.`;

  return textResult(
    `Finding created: "${r.finding.title}" (id=${r.finding.id}).${linkNote}`,
    {
      kind: "create_finding",
      finding_id: r.finding.id,
      title: r.finding.title,
      created_at: r.finding.createdAt,
      link: r.link ?? null,
    },
  );
}
