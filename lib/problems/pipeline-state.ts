/**
 * Pure helper that maps platform-level counts to the 9-stage workflow ribbon
 * shown in the quick-view popup on `/problems/[id]`. The 9 stages match the
 * BRIEF/02-STRUCTURE.md canonical workflow ribbon literally:
 *
 *   PROBLEM → SUB-PROBLEMS → RESEARCH → PROPOSALS
 *           → CRITIQUE → STEELMAN → VERIFY → SYNTH → CONVERGENCE
 *
 * COUNCIL (perspectives) is orthogonal — surfaced as a side-band, not a stage.
 */

export type StageStatus = "done" | "active" | "pending";

export const PIPELINE_STAGE_KEYS = [
  "problem",
  "subProblems",
  "research",
  "proposals",
  "critique",
  "steelman",
  "verify",
  "synth",
  "convergence",
] as const;
export type PipelineStageKey = (typeof PIPELINE_STAGE_KEYS)[number];

export interface PipelineStage {
  key: PipelineStageKey;
  /** Display label as it appears in the BRIEF ribbon (small caps in UI). */
  label: string;
  status: StageStatus;
  /** Optional short detail rendered alongside the dot (e.g. "4 sub-problems"). */
  detail?: string;
}

export interface PipelineState {
  stages: PipelineStage[];
  council: {
    total: number;
    filled: number;
    label: string;
  };
}

export interface PipelineInputs {
  subProblemsCount: number;
  perspectivesTotal: number;
  perspectivesFilled: number;
  findingsTotal: number;
  proposalsActive: number;
  proposalsAccepted: number;
  pathwaysAccepted: number;
  hasSynthesisContent: boolean;
  synthesisRecommendsPathway: boolean;
}

export function computePipelineState(p: PipelineInputs): PipelineState {
  const stages: PipelineStage[] = [
    {
      key: "problem",
      label: "Problem",
      status: "done",
      detail: "exists",
    },
    {
      key: "subProblems",
      label: "Sub-problems",
      status: p.subProblemsCount > 0 ? "done" : "active",
      detail: p.subProblemsCount > 0 ? `${p.subProblemsCount} defined` : "decompose first",
    },
    {
      key: "research",
      label: "Research",
      status:
        p.findingsTotal > 0
          ? "done"
          : p.subProblemsCount === 0
            ? "pending"
            : "active",
      detail:
        p.findingsTotal > 0
          ? `${p.findingsTotal} finding${p.findingsTotal === 1 ? "" : "s"}`
          : undefined,
    },
    {
      key: "proposals",
      label: "Proposals",
      status:
        p.proposalsActive + p.proposalsAccepted > 0
          ? "done"
          : p.findingsTotal === 0
            ? "pending"
            : "active",
      detail:
        p.proposalsActive + p.proposalsAccepted > 0
          ? `${p.proposalsActive + p.proposalsAccepted} written`
          : undefined,
    },
  ];

  // CRITIQUE / STEELMAN / VERIFY are the post-proposal review stages. We don't
  // count per-role posts separately (would need a new query); collapse them
  // into a uniform "in progress once proposals exist, done once any have been
  // accepted" signal. Good enough for the quick-view daily-glance UX.
  const reviewStatus: StageStatus =
    p.proposalsAccepted > 0
      ? "done"
      : p.proposalsActive > 0
        ? "active"
        : "pending";

  stages.push(
    { key: "critique", label: "Critique", status: reviewStatus },
    { key: "steelman", label: "Steelman", status: reviewStatus },
    { key: "verify", label: "Verify", status: reviewStatus },
  );

  stages.push({
    key: "synth",
    label: "Synth",
    status:
      p.synthesisRecommendsPathway
        ? "done"
        : p.hasSynthesisContent || p.proposalsAccepted > 0
          ? "active"
          : "pending",
    detail: p.hasSynthesisContent ? "synthesis live" : undefined,
  });

  stages.push({
    key: "convergence",
    label: "Convergence",
    status:
      p.pathwaysAccepted > 0
        ? "done"
        : p.proposalsAccepted >= 2
          ? "active"
          : "pending",
    detail:
      p.pathwaysAccepted > 0
        ? `${p.pathwaysAccepted} pathway${p.pathwaysAccepted === 1 ? "" : "s"} accepted`
        : p.proposalsAccepted >= 2
          ? "ready to compose"
          : undefined,
  });

  return {
    stages,
    council: {
      total: p.perspectivesTotal,
      filled: p.perspectivesFilled,
      label:
        p.perspectivesTotal === 0
          ? "Council not yet formed"
          : `Council: ${p.perspectivesFilled} of ${p.perspectivesTotal} filled`,
    },
  };
}
