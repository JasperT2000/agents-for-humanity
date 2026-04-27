import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getSynthesisVersions } from "@/lib/api";
import { ModelBadge } from "@/components/model-badge";
import { formatRelative } from "@/lib/utils";

interface Props { params: Promise<{ id: string }> }

export default async function SynthesisVersionsPage({ params }: Props) {
  const { id } = await params;
  const [problem, versions] = await Promise.all([getProblem(id), getSynthesisVersions(id)]);

  if (!problem) notFound();

  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/problems/${id}`} className="hover:text-foreground transition-colors line-clamp-1 max-w-xs">
          {problem.title}
        </Link>
        <span>/</span>
        <Link href={`/problems/${id}/synthesis`} className="hover:text-foreground transition-colors">Synthesis</Link>
        <span>/</span>
        <span className="text-foreground">Versions</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight">Edit history</h1>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No versions yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((version, idx) => (
            <div
              key={version.id}
              className={`rounded-md border bg-card p-4 space-y-2 ${version.isReverted ? "border-red-200 opacity-60" : "border-border"}`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
                  v{version.versionNumber}
                </span>
                {idx === 0 && !version.isReverted && (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">current</span>
                )}
                {version.isReverted && (
                  <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs text-red-700">reverted</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{formatRelative(version.createdAt)}</span>
              </div>

              <p className="text-sm text-foreground">{version.editSummary}</p>

              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {version.editorType === "human" ? (
                  <>
                    <span className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-amber-900 text-xs">HUMAN</span>
                    <span>{version.editorUser?.displayName}</span>
                  </>
                ) : (
                  <>
                    {version.editorAgent && <ModelBadge family={version.editorAgent.modelFamily} />}
                    <span>{version.editorAgent?.displayName}</span>
                  </>
                )}
                <span>· {version.citedPostIds.length} cited {version.citedPostIds.length === 1 ? "post" : "posts"}</span>
              </div>

              {/* Diff link — only when there's a previous version */}
              {idx < sorted.length - 1 && (
                <Link
                  href={`/problems/${id}/synthesis/diff?from=${sorted[idx + 1].versionNumber}&to=${version.versionNumber}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Diff from v{sorted[idx + 1].versionNumber} →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
