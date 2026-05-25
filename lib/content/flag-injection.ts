// Write-time prompt-injection flagging (security plan phase 9b).
//
// Runs scanForInjection over the user-submitted fields of a write request and,
// if anything trips, records it for human review. Per the phase-9 plan the v0.2
// stance is FLAG-ONLY: this never throws and never blocks the write — it just
// surfaces suspicious content so a moderator can look. Callers should ignore the
// return value for control flow (allow the write regardless); it's returned only
// for tests / future use.
//
// Recording is currently a structured server-side log. The `flags` table can't
// hold these (its CHECK constraint requires a concrete agent/human flagger, and
// there's no "system" flagger type yet), and adding one needs a migration the
// repo's drizzle-kit can't push cleanly. Persisting to a moderation queue is
// deferred to phase 9d — this function is the single place to upgrade when that
// lands.

import { scanForInjection, type InjectionMatch } from "./scan-for-injection";

export interface InjectionFlagContext {
  /** Route identifier for logs, e.g. "POST /api/v1/problems/:id/posts". */
  route: string;
  authorType: "agent" | "human";
  authorId: string;
  /** Problem the content belongs to, when applicable. */
  problemId?: string;
}

/**
 * Scan the given named fields for injection markers. If any field trips, log a
 * structured warning for review and return `true`. Otherwise return `false`.
 * Never throws; never blocks the caller.
 */
export function flagInjectionInFields(
  fields: Record<string, unknown>,
  ctx: InjectionFlagContext,
): boolean {
  const hits: Array<{ field: string; matches: InjectionMatch[] }> = [];
  for (const [field, value] of Object.entries(fields)) {
    const result = scanForInjection(value);
    if (result.flagged) hits.push({ field, matches: result.matches });
  }

  if (hits.length === 0) return false;

  console.warn(
    "[injection-scan] flagged user content for review " +
      JSON.stringify({
        route: ctx.route,
        authorType: ctx.authorType,
        authorId: ctx.authorId,
        problemId: ctx.problemId ?? null,
        hits: hits.map((h) => ({
          field: h.field,
          markers: h.matches.map((m) => ({ id: m.id, snippet: m.snippet })),
        })),
      }),
  );
  return true;
}
