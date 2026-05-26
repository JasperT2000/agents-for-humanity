import Link from "next/link";

import type { PerspectiveSummary } from "@/lib/types";

interface CouncilPanelProps {
  perspectives: PerspectiveSummary[];
}

/**
 * Renders the "council" — the perspectives (viewpoint identities) registered
 * on a problem. Each row shows a status dot, label, and (if filled) the
 * agent or human currently holding the seat. Empty state nudges the reader
 * toward the agents' role: humans don't form the council in v1.
 */
export function CouncilPanel({ perspectives }: CouncilPanelProps) {
  if (perspectives.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-5 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Council
        </h2>
        <p className="text-sm text-foreground/80">Council not yet formed.</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Agents will register the viewpoints (caseworker, rural mother, security trainer, …) that
          should be at the table before posting opens.
        </p>
      </div>
    );
  }

  const filled = perspectives.filter((p) => p.status === "filled").length;
  const active = perspectives.filter((p) => p.status === "active").length;
  const empty = perspectives.filter((p) => p.status === "empty").length;

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Council
        </h2>
        <p className="text-xs text-muted-foreground">
          {filled} filled · {active} active · {empty} open
        </p>
      </div>
      <ul className="space-y-1.5">
        {perspectives.map((p) => (
          <CouncilRow key={p.id} perspective={p} />
        ))}
      </ul>
    </div>
  );
}

function CouncilRow({ perspective }: { perspective: PerspectiveSummary }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <StatusDot status={perspective.status} />
      <span className="font-medium text-foreground">{perspective.label}</span>
      <span className="text-xs text-muted-foreground ml-auto">
        {perspective.filledByAgent ? (
          <Link
            href={`/agents/${perspective.filledByAgent.id}`}
            className="hover:text-foreground transition-colors"
          >
            {perspective.filledByAgent.displayName}
          </Link>
        ) : perspective.filledByUser ? (
          <span>{perspective.filledByUser.displayName}</span>
        ) : perspective.status === "active" ? (
          <span className="italic">claimed, awaiting first post</span>
        ) : (
          <span className="italic text-muted-foreground/70">open</span>
        )}
      </span>
    </li>
  );
}

function StatusDot({ status }: { status: PerspectiveSummary["status"] }) {
  const cls =
    status === "filled"
      ? "bg-emerald-500"
      : status === "active"
        ? "bg-amber-400"
        : "bg-muted-foreground/30";
  const aria =
    status === "filled" ? "Filled" : status === "active" ? "Active (claimed)" : "Empty (open)";
  return (
    <span
      aria-label={aria}
      title={aria}
      className={`inline-block size-2 rounded-full shrink-0 translate-y-[1px] ${cls}`}
    />
  );
}
