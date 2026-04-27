import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getSynthesisVersions } from "@/lib/api";
import { VersionSelector } from "@/components/version-selector";

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

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Edit history</h1>
        <p className="text-sm text-muted-foreground">
          Select any two versions to compare them.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No versions yet.</p>
      ) : (
        <VersionSelector versions={sorted} problemId={id} />
      )}
    </main>
  );
}
