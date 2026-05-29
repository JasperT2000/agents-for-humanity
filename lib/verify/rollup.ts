/**
 * Pure roll-up logic for the verify role (Phase 5). Kept DB-free so it can be
 * unit-tested directly. Two things roll up:
 *
 *  1. A single finding's verdicts → a derived status (the ✓/? mark).
 *  2. A proposal's cited findings' statuses → an evidence-strength summary.
 *
 * This is display-only: it informs the ✓-rate badge but does not gate
 * proposal acceptance (deferred to a follow-up).
 */

export type FindingVerdict = "confirmed" | "weak" | "refuted";

export type FindingVerdictStatus =
  | "unverified"
  | "confirmed"
  | "weak"
  | "contested"
  | "refuted";

export interface VerdictCounts {
  confirmed: number;
  weak: number;
  refuted: number;
}

export function countVerdicts(verdicts: FindingVerdict[]): VerdictCounts {
  const counts: VerdictCounts = { confirmed: 0, weak: 0, refuted: 0 };
  for (const v of verdicts) counts[v] += 1;
  return counts;
}

/**
 * Derive a finding's status from its verdict counts. Refutation is the strongest
 * negative signal, so it wins ties against confirmation — a finding the council
 * says the source doesn't support shouldn't read as "confirmed".
 */
export function rollUpFindingStatus(counts: VerdictCounts): FindingVerdictStatus {
  const { confirmed: c, weak: w, refuted: r } = counts;
  const n = c + w + r;
  if (n === 0) return "unverified";
  if (r >= 1 && r >= c) return "refuted";
  if (c >= 1 && c >= w + r) return "confirmed";
  if (w >= 1 && c === 0) return "weak";
  return "contested";
}

export function findingStatusFromVerdicts(verdicts: FindingVerdict[]): FindingVerdictStatus {
  return rollUpFindingStatus(countVerdicts(verdicts));
}

export type ProposalEvidenceLabel =
  | "unbacked" // cites no findings
  | "unverified" // cites findings but none verified yet
  | "refuted" // at least one cited finding was refuted
  | "partial" // some confirmed, below the strong threshold
  | "strong"; // ≥ ⅔ of cited findings confirmed

export interface ProposalEvidenceStrength {
  citedTotal: number;
  confirmedCount: number;
  weakCount: number;
  refutedCount: number;
  unverifiedCount: number;
  /** confirmed / citedTotal, 0 when nothing is cited. */
  confirmedRate: number;
  hasRefuted: boolean;
  label: ProposalEvidenceLabel;
}

const STRONG_CONFIRMED_RATE = 2 / 3;

/**
 * Summarise a proposal's evidence from the derived statuses of the findings it
 * cites. `contested` counts as neither confirmed nor refuted for the rate.
 */
export function computeProposalEvidenceStrength(
  citedStatuses: FindingVerdictStatus[],
): ProposalEvidenceStrength {
  const citedTotal = citedStatuses.length;
  let confirmedCount = 0;
  let weakCount = 0;
  let refutedCount = 0;
  let unverifiedCount = 0;
  for (const s of citedStatuses) {
    if (s === "confirmed") confirmedCount += 1;
    else if (s === "weak") weakCount += 1;
    else if (s === "refuted") refutedCount += 1;
    else if (s === "unverified") unverifiedCount += 1;
    // "contested" intentionally counts toward none of the buckets above.
  }
  const confirmedRate = citedTotal === 0 ? 0 : confirmedCount / citedTotal;
  const hasRefuted = refutedCount > 0;

  let label: ProposalEvidenceLabel;
  if (citedTotal === 0) label = "unbacked";
  else if (hasRefuted) label = "refuted";
  else if (confirmedCount === 0) label = "unverified";
  else if (confirmedRate >= STRONG_CONFIRMED_RATE) label = "strong";
  else label = "partial";

  return {
    citedTotal,
    confirmedCount,
    weakCount,
    refutedCount,
    unverifiedCount,
    confirmedRate,
    hasRefuted,
    label,
  };
}
