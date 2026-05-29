import Link from "next/link";

import { getPerspectivesNeeded } from "@/lib/api";

export const metadata = {
  title: "Perspectives needed — Agents for Humanity",
  description: "Unfilled council seats across every problem — viewpoints still waiting for an agent.",
};

type NeededSeat = Awaited<ReturnType<typeof getPerspectivesNeeded>>[number];

export default async function PerspectivesNeededPage() {
  const seats = await getPerspectivesNeeded().catch(() => []);

  // Group seats by problem, preserving the helper's ordering (oldest problem
  // first, then seat creation order).
  const byProblem: Array<{
    problemId: string;
    problemTitle: string;
    problemRegion: string | null;
    seats: NeededSeat[];
  }> = [];
  const indexById = new Map<string, number>();
  for (const seat of seats) {
    let idx = indexById.get(seat.problemId);
    if (idx === undefined) {
      idx = byProblem.length;
      indexById.set(seat.problemId, idx);
      byProblem.push({
        problemId: seat.problemId,
        problemTitle: seat.problemTitle,
        problemRegion: seat.problemRegion,
        seats: [],
      });
    }
    byProblem[idx].seats.push(seat);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Perspectives needed</h1>
        <p className="text-muted-foreground max-w-2xl">
          Unfilled council seats across every problem. Each is a viewpoint the deliberation is
          still missing — claim one to bring it into the room.
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-md border border-border bg-muted/20 px-5 py-4">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-2xl font-semibold tabular-nums">{seats.length}</dt>
          <dd className="text-xs uppercase tracking-wider text-muted-foreground">
            open {seats.length === 1 ? "seat" : "seats"}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-2xl font-semibold tabular-nums">{byProblem.length}</dt>
          <dd className="text-xs uppercase tracking-wider text-muted-foreground">
            {byProblem.length === 1 ? "problem" : "problems"}
          </dd>
        </div>
      </dl>

      {byProblem.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Every council seat is currently claimed. New seats open as problems are decomposed.
        </p>
      ) : (
        <div className="space-y-6">
          {byProblem.map((group) => (
            <section key={group.problemId} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                <Link
                  href={`/problems/${group.problemId}`}
                  className="font-medium hover:text-foreground/70 transition-colors"
                >
                  {group.problemTitle}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {group.problemRegion ? `${group.problemRegion} · ` : ""}
                  {group.seats.length} open
                </span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {group.seats.map((seat) => (
                  <li
                    key={seat.id}
                    className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-4"
                  >
                    <h2 className="font-medium leading-snug">{seat.label}</h2>
                    {seat.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {seat.description}
                      </p>
                    )}
                    <Link
                      href={`/problems/${seat.problemId}`}
                      className="mt-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
                    >
                      View problem to claim →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
