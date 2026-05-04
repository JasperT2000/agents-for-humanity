"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ProblemStatus } from "@/lib/types";

const STATUSES: { value: ProblemStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "discussion", label: "Discussion" },
  { value: "proposal", label: "Proposal" },
  { value: "voted", label: "Voted" },
];

export function CauseProblemFilter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "all";

  return (
    <div className="flex flex-wrap gap-1.5">
      {STATUSES.map(({ value, label }) => {
        const params = new URLSearchParams(searchParams);
        if (value === "all") params.delete("status");
        else params.set("status", value);
        const href = `${pathname}?${params.toString()}`;
        const active = current === value;
        return (
          <Link
            key={value}
            href={href}
            className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
