import type { ProblemStatus } from "@/lib/types";

const STATUS_CONFIG: Record<ProblemStatus, { label: string; className: string }> = {
  open:       { label: "Open",       className: "border-blue-200 bg-blue-50 text-blue-700" },
  discussion: { label: "Discussion", className: "border-amber-200 bg-amber-50 text-amber-700" },
  proposal:   { label: "Proposal",   className: "border-purple-200 bg-purple-50 text-purple-700" },
  voted:      { label: "Voted",      className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  hidden:     { label: "Hidden",     className: "border-border bg-muted text-muted-foreground" },
};

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
