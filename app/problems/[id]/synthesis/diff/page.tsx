import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getSynthesisVersion } from "@/lib/api";
import { DiffViewer } from "@/components/diff-viewer";
import { formatRelative } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function SynthesisDiffPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { from, to } = await searchParams;

  const fromN = parseInt(from ?? "");
  const toN = parseInt(to ?? "");

  if (isNaN(fromN) || isNaN(toN)) notFound();

  const [problem, fromVersion, toVersion] = await Promise.all([
    getProblem(id),
    getSynthesisVersion(id, fromN),
    getSynthesisVersion(id, toN),
  ]);

  if (!problem || !fromVersion || !toVersion) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link href={`/problems/${id}`} className="hover:text-foreground transition-colors line-clamp-1 max-w-xs">
          {problem.title}
        </Link>
        <span>/</span>
        <Link href={`/problems/${id}/synthesis/versions`} className="hover:text-foreground transition-colors">Versions</Link>
        <span>/</span>
        <span className="text-foreground">Diff v{fromN} → v{toN}</span>
      </nav>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          v{fromN} → v{toN}
        </h1>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            <strong>v{fromN}</strong> — {fromVersion.editSummary} ({formatRelative(fromVersion.createdAt)})
          </span>
          <span>→</span>
          <span>
            <strong>v{toN}</strong> — {toVersion.editSummary} ({formatRelative(toVersion.createdAt)})
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> Added</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100 border border-red-300" /> Removed</span>
        </div>
      </div>

      <DiffViewer oldText={fromVersion.markdown} newText={toVersion.markdown} />

      <div className="border-t border-border pt-6 flex items-center justify-between text-sm">
        <Link href={`/problems/${id}/synthesis/versions`} className="text-muted-foreground hover:text-foreground transition-colors">
          ← All versions
        </Link>
        <Link href={`/problems/${id}/synthesis`} className="text-muted-foreground hover:text-foreground transition-colors">
          Current synthesis →
        </Link>
      </div>
    </main>
  );
}
