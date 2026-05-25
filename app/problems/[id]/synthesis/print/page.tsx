import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SynthesisViewer } from "@/components/synthesis-viewer";
import { getProblem, getSynthesis } from "@/lib/api";

// Force dynamic — synthesis content changes; we don't want stale snapshots.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Print-styled synthesis view. Opens with the browser print dialog ready;
 * generous margins, serif body, no chrome, single-column. Caseworker quote
 * (if any) is highlighted via the existing SynthesisViewer rendering plus
 * the print CSS below.
 *
 * Linked from the regular synthesis page via a "Print" button (to add) and
 * from anywhere via /problems/[id]/synthesis/print.
 */
export default async function SynthesisPrintPage({ params }: Props) {
  const { id } = await params;
  const [problem, synthesis] = await Promise.all([
    getProblem(id).catch(() => null),
    getSynthesis(id).catch(() => null),
  ]);
  if (!problem || !synthesis) notFound();

  const generatedOn = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* Print-specific CSS scoped to this page only */}
      <style>{`
        @page {
          size: A4;
          margin: 22mm 20mm;
        }
        @media print {
          html, body { background: #fffaf2 !important; color: #1a1611 !important; }
          .no-print { display: none !important; }
          a { color: inherit !important; text-decoration: none !important; }
          .print-document { box-shadow: none !important; border: 0 !important; padding: 0 !important; max-width: none !important; }
        }
        .print-document {
          background: #fffaf2;
          color: #1a1611;
          font-family: "Iowan Old Style", "Source Serif Pro", Georgia, serif;
          line-height: 1.6;
          font-size: 12pt;
        }
        .print-document h1 { font-style: italic; font-size: 22pt; line-height: 1.2; margin: 0 0 0.6rem; }
        .print-document h2 { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 10pt; letter-spacing: 0.08em; text-transform: uppercase; color: #3a322a; border-bottom: 1px solid #d6c8b3; padding-bottom: 0.25rem; margin: 1.6rem 0 0.7rem; }
        .print-document h3 { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 9pt; letter-spacing: 0.05em; color: #5a4f42; margin: 1.1rem 0 0.4rem; }
        .print-document blockquote { font-style: italic; border-left: 3px solid #b08960; padding: 0.4rem 0.9rem; background: #f7eedd; margin: 1rem 0; }
        .print-document hr { border: 0; border-top: 1px solid #d6c8b3; margin: 1.5rem 0; }
        .print-document code { background: #f4e9d6; padding: 0.05rem 0.3rem; border-radius: 2px; }
        .print-meta { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 9pt; color: #5a4f42; text-align: right; margin-top: 2rem; padding-top: 0.75rem; border-top: 1px solid #d6c8b3; }
      `}</style>

      <div className="no-print mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
          <p className="flex-1 text-muted-foreground">
            Print-styled synthesis. Use your browser&rsquo;s <strong>Print &rarr; Save as PDF</strong> for a portable copy.
          </p>
          <a
            href={`/problems/${id}/synthesis`}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            &larr; Back to synthesis
          </a>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
            data-print-trigger
          >
            Print
          </button>
        </div>
      </div>

      <main className="print-document mx-auto max-w-2xl px-8 py-10 sm:px-12 my-6 border border-border rounded-md shadow-sm">
        <header>
          <p className="text-[10pt] font-mono uppercase tracking-wider text-[#5a4f42]">A working synthesis</p>
          <h1>{problem.title}</h1>
          <p className="text-[10pt] font-mono text-[#5a4f42]">
            {problem.region ? `${problem.region} · ` : ""}
            v{synthesis.currentVersion}
            {" · "}
            {new Date(synthesis.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </p>
        </header>

        <hr />

        <Suspense fallback={null}>
          <SynthesisViewer markdown={synthesis.currentMarkdown} />
        </Suspense>

        <div className="print-meta">
          Generated {generatedOn} · agentsforhumanity.ai/problems/{id}/synthesis
        </div>
      </main>

      {/* Small inline script wires the Print button to window.print(). Inert in non-browser environments. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener('DOMContentLoaded',function(){var b=document.querySelector('[data-print-trigger]');if(b){b.addEventListener('click',function(){window.print()});}});`,
        }}
      />
    </>
  );
}
