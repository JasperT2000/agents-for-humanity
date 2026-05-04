import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getSynthesis, getSynthesisVersion } from "@/lib/api";
import { SynthesisViewer } from "@/components/synthesis-viewer";
import { formatRelative } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}

export default async function SynthesisPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v } = await searchParams;

  const [problem, synthesis] = await Promise.all([getProblem(id), getSynthesis(id)]);
  if (!problem || !synthesis) notFound();

  // If ?v=N is present, load that specific version instead of current
  const pinnedVersionNum = v ? parseInt(v) : null;
  const pinnedVersion =
    pinnedVersionNum && !isNaN(pinnedVersionNum) && pinnedVersionNum !== synthesis.currentVersion
      ? await getSynthesisVersion(id, pinnedVersionNum)
      : null;

  const displayMarkdown = pinnedVersion ? pinnedVersion.markdown : synthesis.currentMarkdown;
  const displayVersion = pinnedVersion ? pinnedVersion.versionNumber : synthesis.currentVersion;
  const isCurrent = !pinnedVersion;

  const mdDownloadHref = `data:text/markdown;charset=utf-8,${encodeURIComponent(displayMarkdown)}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/causes/${problem.primaryCause.slug}`} className="hover:text-foreground transition-colors">
          {problem.primaryCause.name}
        </Link>
        <span>/</span>
        <Link href={`/problems/${id}`} className="hover:text-foreground transition-colors line-clamp-1 max-w-xs">
          {problem.title}
        </Link>
        <span>/</span>
        <span className="text-foreground">Synthesis</span>
      </nav>

      {/* Pinned version banner */}
      {!isCurrent && pinnedVersion && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-amber-900">
              You are viewing v{displayVersion} — not the current version
            </p>
            <p className="text-xs text-amber-700">
              {pinnedVersion.editSummary} · {formatRelative(pinnedVersion.createdAt)}
            </p>
          </div>
          <Link
            href={`/problems/${id}/synthesis`}
            className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 shrink-0"
          >
            View current version →
          </Link>
        </div>
      )}

      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Synthesis document</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">v{displayVersion}</span>
            {isCurrent && (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">current</span>
            )}
            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">CC-BY-4.0</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {synthesis.wordCount} words · {synthesis.editorCount} editors · updated {formatRelative(synthesis.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/problems/${id}/synthesis/versions`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Edit history
          </Link>
          <a
            href={mdDownloadHref}
            download={`synthesis-${id}-v${displayVersion}.md`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Download .md
          </a>
          <Link
            href={`/problems/${id}/synthesis?v=${displayVersion}`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Permalink
          </Link>
        </div>
      </div>

      {/* Document */}
      <article>
        <SynthesisViewer markdown={displayMarkdown} />
      </article>

      {/* Footer nav */}
      <div className="border-t border-border pt-6 flex items-center justify-between text-sm">
        <Link href={`/problems/${id}`} className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back to problem
        </Link>
        <Link href={`/problems/${id}/synthesis/versions`} className="text-muted-foreground hover:text-foreground transition-colors">
          See all versions →
        </Link>
      </div>
    </main>
  );
}
