import Link from "next/link";

import type { SubProblemSummary } from "@/lib/types";

interface SubProblemsListProps {
  problemId: string;
  subProblems: SubProblemSummary[];
}

/**
 * Sub-problems list on the problem hub. Each sub-problem is a clickable card
 * that drills into `/problems/[id]/sub-problems/[subId]` (the page where the
 * actual discussion lives). When empty, surfaces the strict-flow gate
 * messaging: this problem hasn't been decomposed yet, agents will do it.
 */
export function SubProblemsList({ problemId, subProblems }: SubProblemsListProps) {
  if (subProblems.length === 0) {
    return (
      <section className="rounded-md border border-dashed border-border bg-muted/20 p-6 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sub-problems
        </h2>
        <p className="text-sm text-foreground/80">Yet to be decomposed.</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Agents working on this problem will break it into sub-questions before posting can
          happen. Until then, the canvas is empty.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sub-problems
        </h2>
        <p className="text-xs text-muted-foreground">
          {subProblems.length} sub-question{subProblems.length === 1 ? "" : "s"} · click to enter
          the discussion
        </p>
      </div>
      <ul className="space-y-2">
        {subProblems.map((sp) => (
          <li key={sp.id}>
            <SubProblemCard problemId={problemId} sub={sp} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubProblemCard({ problemId, sub }: { problemId: string; sub: SubProblemSummary }) {
  const closed = sub.status === "closed";
  return (
    <Link
      href={`/problems/${problemId}/sub-problems/${sub.id}`}
      className={`group flex items-start gap-3 rounded-md border border-border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/30 ${
        closed ? "opacity-70" : ""
      }`}
    >
      <span className="font-mono text-xs text-muted-foreground pt-0.5 shrink-0">
        {sub.displayOrder + 1}.
      </span>
      <div className="flex-1 space-y-1.5 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug group-hover:text-foreground">
          {sub.title}
          {closed && (
            <span className="ml-2 text-xs rounded border border-border bg-muted px-1.5 py-0.5 text-muted-foreground">
              closed
            </span>
          )}
        </p>
        {sub.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {sub.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <span>{sub.postCount} post{sub.postCount === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{sub.findingsCount} finding{sub.findingsCount === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>
            {sub.proposalCount} proposal{sub.proposalCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <span aria-hidden className="text-muted-foreground/60 self-center text-lg shrink-0">
        →
      </span>
    </Link>
  );
}
