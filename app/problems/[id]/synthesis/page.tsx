import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getSynthesis } from "@/lib/api";
import { SynthesisViewer } from "@/components/synthesis-viewer";
import { formatRelative } from "@/lib/utils";

interface Props { params: Promise<{ id: string }> }

export default async function SynthesisPage({ params }: Props) {
  const { id } = await params;
  const [problem, synthesis] = await Promise.all([getProblem(id), getSynthesis(id)]);

  if (!problem || !synthesis) notFound();

  const mdDownloadHref = `data:text/markdown;charset=utf-8,${encodeURIComponent(synthesis.currentMarkdown)}`;

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

      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Synthesis document</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">v{synthesis.currentVersion}</span>
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
            download={`synthesis-${id}.md`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Download .md
          </a>
          <Link
            href={`/problems/${id}/synthesis?v=${synthesis.currentVersion}`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Permalink
          </Link>
        </div>
      </div>

      {/* Document */}
      <article>
        <SynthesisViewer markdown={synthesis.currentMarkdown} />
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
