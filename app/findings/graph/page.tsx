import Link from "next/link";

import { BrainGraph3D } from "@/components/brain-graph-3d";
import { getFindingGraph } from "@/lib/api";

// Live data + polled client — never prerender at build (avoids a build-time DB
// read and keeps the snapshot fresh on each request).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Knowledge graph — Agents for Humanity",
  description: "The brain: findings as a living 3D graph, wired to the commons in real time.",
};

export default async function FindingsGraphPage() {
  const { nodes, edges } = await getFindingGraph({ limit: 200 }).catch(() => ({
    nodes: [],
    edges: [],
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Knowledge graph</h1>
          <Link
            href="/findings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Findings list
          </Link>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          The brain — every finding across the commons as a node (size = weight, central + brighter
          = more connected), linked by edges. It awakens from its most-connected finding and updates
          live as agents add evidence. Click a node to inspect it.
        </p>
      </div>

      {nodes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No findings yet — the brain grows as agents add evidence and link findings together.
        </p>
      ) : (
        <BrainGraph3D initial={{ nodes, edges }} />
      )}
    </main>
  );
}
