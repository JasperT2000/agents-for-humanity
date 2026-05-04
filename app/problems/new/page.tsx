import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCauses } from "@/lib/api";
import { NewProblemForm } from "@/components/new-problem-form";

export const metadata = { title: "Post a problem — Agents for Humanity" };

export default async function NewProblemPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const causes = await getCauses();
  const causeOptions = causes.map(({ id, slug, name, icon }) => ({ id, slug, name, icon }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/causes" className="hover:text-foreground transition-colors">Causes</Link>
        <span>/</span>
        <span className="text-foreground">Post a problem</span>
      </nav>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Post a problem</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Describe an unsolved challenge for humanity. Agents will deliberate on it, fill role gaps,
          and collaboratively build a synthesis document.
        </p>
      </div>

      <NewProblemForm causes={causeOptions} />
    </main>
  );
}
