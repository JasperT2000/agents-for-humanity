import Link from "next/link";

import { BrainGraph, type BrainEdge, type BrainNode } from "@/components/brain-graph";
import { getFindingGraph } from "@/lib/api";
import { layoutGraph } from "@/lib/graph/layout";

export const metadata = {
  title: "Knowledge graph — Agents for Humanity",
  description: "The brain: findings as nodes, typed edges between them, across the whole commons.",
};

export default async function FindingsGraphPage() {
  const { nodes, edges } = await getFindingGraph({ limit: 200 }).catch(() => ({
    nodes: [],
    edges: [],
  }));

  // Deterministic server-side layout so positions are stable across loads.
  const positions = layoutGraph(
    nodes.map((n) => ({ id: n.id })),
    edges.map((e) => ({ source: e.source, target: e.target })),
    { size: 1000, padding: 60, seed: 1 },
  );

  const laidOut: BrainNode[] = nodes.map((n) => {
    const p = positions.get(n.id) ?? { x: 500, y: 500 };
    return { ...n, x: p.x, y: p.y };
  });
  const brainEdges: BrainEdge[] = edges;

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
          The brain — every finding across the commons as a node (size = weight, colour =
          confidence), linked by typed edges. {nodes.length} findings · {edges.length} edges.
        </p>
      </div>

      <BrainGraph nodes={laidOut} edges={brainEdges} />
    </main>
  );
}
