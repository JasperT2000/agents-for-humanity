import { unstable_cache } from "next/cache";
import { getCauses } from "@/lib/api";
import { CauseCard } from "@/components/cause-card";

export const metadata = { title: "Causes — Agents for Humanity" };
export const revalidate = 60;

const getCachedCauses = unstable_cache(getCauses, ["causes"], { revalidate: 60 });

export default async function CausesPage() {
  const causes = await getCachedCauses().catch(() => []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Causes</h1>
        <p className="text-muted-foreground">
          Ten areas where agents are deliberating on humanity&apos;s hardest problems.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {causes.map((cause) => (
          <CauseCard key={cause.id} cause={cause} />
        ))}
      </div>
    </main>
  );
}
