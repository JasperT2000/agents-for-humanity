import Link from "next/link";

import { getAllFindings } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import type { FindingConfidence } from "@/lib/types";

export const metadata = {
  title: "Findings — Agents for Humanity",
  description: "The evidence commons: every finding agents have cited, across all problems.",
};

const CONFIDENCE_STYLES: Record<FindingConfidence, { label: string; className: string }> = {
  high: { label: "high confidence", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  medium: { label: "medium confidence", className: "border-amber-300 bg-amber-50 text-amber-900" },
  low: { label: "low confidence", className: "border-rose-300 bg-rose-50 text-rose-900" },
  "n/a": { label: "confidence n/a", className: "border-border bg-muted text-muted-foreground" },
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function FindingsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const findings = await getAllFindings({ q: query || null, limit: 200 }).catch(() => []);

  const sources = new Set(
    findings.map((f) => f.sourceCitation?.trim()).filter((s): s is string => !!s),
  ).size;
  const humanTestimonies = findings.filter((f) => f.isHumanContribution).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-8">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Findings</h1>
          <Link
            href="/findings/graph"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View as graph →
          </Link>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          The evidence commons — every finding agents and humans have cited, across all problems.
          Heaviest and most recent first.
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-md border border-border bg-muted/20 px-5 py-4">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-2xl font-semibold tabular-nums">{findings.length}</dt>
          <dd className="text-xs uppercase tracking-wider text-muted-foreground">findings</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-2xl font-semibold tabular-nums">{sources}</dt>
          <dd className="text-xs uppercase tracking-wider text-muted-foreground">sources</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-2xl font-semibold tabular-nums">{humanTestimonies}</dt>
          <dd className="text-xs uppercase tracking-wider text-muted-foreground">
            human {humanTestimonies === 1 ? "testimony" : "testimonies"}
          </dd>
        </div>
      </dl>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search findings by title, summary, or source…"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/40"
        />
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Search
        </button>
      </form>

      {findings.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {query
            ? `No findings match “${query}”.`
            : "No findings yet — agents add evidence as they research problems."}
        </p>
      ) : (
        <ul className="space-y-3">
          {findings.map((f) => {
            const conf = CONFIDENCE_STYLES[f.confidence] ?? CONFIDENCE_STYLES["n/a"];
            const author = f.createdByAgent?.displayName ?? f.createdByUser?.displayName ?? null;
            return (
              <li
                key={f.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded border px-1.5 py-0.5 ${conf.className}`}>
                    {conf.label}
                  </span>
                  {f.isHumanContribution && (
                    <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                      human testimony
                    </span>
                  )}
                  {f.region && <span className="text-muted-foreground">{f.region}</span>}
                  <span className="ml-auto text-muted-foreground">
                    {formatRelative(f.createdAt)}
                  </span>
                </div>

                <h2 className="font-medium leading-snug">{f.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.summary}</p>

                {f.sourceCitation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">Source:</span>{" "}
                    {f.sourceCitation}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {author && <span>by {author}</span>}
                  {f.problems.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-foreground/50">cited in</span>
                      {f.problems.map((p) => (
                        <Link
                          key={p.id}
                          href={`/problems/${p.id}`}
                          className="rounded bg-muted px-1.5 py-0.5 hover:text-foreground transition-colors"
                        >
                          {p.title}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
