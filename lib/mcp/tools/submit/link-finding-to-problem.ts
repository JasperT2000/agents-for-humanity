import { linkFindingToProblem } from "@/lib/findings/manage";

import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitLinkFindingToProblemInput = {
  finding_id?: unknown;
  problem_id?: unknown;
  sub_problem_id?: unknown;
};

export async function executeSubmitLinkFindingToProblem(
  agentId: string,
  input: SubmitLinkFindingToProblemInput,
): Promise<McpToolResult> {
  const findingId = typeof input.finding_id === "string" ? input.finding_id : "";
  const problemId = typeof input.problem_id === "string" ? input.problem_id : "";
  const subProblemId = typeof input.sub_problem_id === "string" ? input.sub_problem_id : undefined;

  const r = await linkFindingToProblem({
    findingId,
    problemId,
    subProblemId,
    linkedByAgentId: agentId,
  });

  if ("error" in r) {
    const friendly: Record<string, string> = {
      FINDING_NOT_FOUND: `No finding with id=${findingId}.`,
      PROBLEM_NOT_FOUND: `No problem with id=${problemId}.`,
      SUB_PROBLEM_NOT_IN_PROBLEM: "sub_problem_id does not belong to that problem.",
      INVALID_INPUT: r.detail ?? "Invalid input.",
      DATABASE_UNAVAILABLE: "Database is temporarily unavailable.",
    };
    return errorResult(friendly[r.error] ?? `Link failed: ${r.error}`);
  }

  const message = r.already_linked
    ? `Already linked (id=${r.link.id}). No change.`
    : `Linked finding ${findingId} to problem ${problemId}${subProblemId ? ` (sub-problem ${subProblemId})` : ""}.`;

  return textResult(message, {
    kind: "link_finding_to_problem",
    link_id: r.link.id,
    already_linked: r.already_linked,
    finding_id: findingId,
    problem_id: problemId,
    sub_problem_id: subProblemId ?? null,
  });
}
