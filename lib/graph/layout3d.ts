/**
 * Pure, deterministic 3D spheroid layout for the knowledge-graph "brain",
 * ported from the BRIEF's DEMO/js/brain.js so the live brain matches the locked
 * aesthetic. Kept DB-free + framework-free so it can be unit-tested and reused
 * by the Three.js client component.
 *
 * Centrality (edge-connection count) drives the spheroid radius + colour tier
 * (well-connected findings pull toward the core); the finding's `weight` drives
 * node size, per the schema's intent for `findings.weight`.
 */

export type BrainTier = "hot" | "brt" | "mid" | "deep";

export interface BrainLayoutNodeInput {
  id: string;
  weight: number;
}

export interface BrainLayoutEdgeInput {
  source: string;
  target: string;
}

export interface BrainLaidOutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  /** point size in world units */
  size: number;
  tier: BrainTier;
  /** 0..1 connectivity centrality */
  importance: number;
}

export interface BrainLayout {
  nodes: BrainLaidOutNode[];
  /** id of the most-connected node — the awakening seed. null if empty. */
  seedId: string | null;
}

// FNV-1a → [0,1), matches brain.js hash01 so positions are deterministic.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return (h % 100000) / 100000;
}

function tierFor(importance: number): BrainTier {
  if (importance > 0.78) return "hot";
  if (importance > 0.5) return "brt";
  if (importance > 0.25) return "mid";
  return "deep";
}

export function layoutBrain3D(
  nodes: BrainLayoutNodeInput[],
  edges: BrainLayoutEdgeInput[],
): BrainLayout {
  const n = nodes.length;
  if (n === 0) return { nodes: [], seedId: null };

  const idToIdx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const connCount = new Array<number>(n).fill(0);
  for (const e of edges) {
    const a = idToIdx.get(e.source);
    const b = idToIdx.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    connCount[a] += 1;
    connCount[b] += 1;
  }
  const maxConn = Math.max(1, ...connCount);

  let seedIdx = 0;
  for (let i = 1; i < n; i++) {
    if (
      connCount[i] > connCount[seedIdx] ||
      (connCount[i] === connCount[seedIdx] && nodes[i].weight > nodes[seedIdx].weight)
    ) {
      seedIdx = i;
    }
  }

  const out: BrainLaidOutNode[] = nodes.map((nd, i) => {
    const importance = Math.min(connCount[i] / maxConn, 1);
    const r0 = (1 - importance) * 22 + 6; // 6..28 — important nodes near the core
    const theta = hash01(nd.id + "theta") * Math.PI * 2;
    const phi = Math.acos(2 * hash01(nd.id + "phi") - 1);
    const w = Number.isFinite(nd.weight) ? Math.max(0, Math.min(1, nd.weight)) : 0.5;
    return {
      id: nd.id,
      x: r0 * Math.sin(phi) * Math.cos(theta),
      y: r0 * Math.cos(phi) * 0.85, // gentle y-squish → spheroid
      z: r0 * Math.sin(phi) * Math.sin(theta),
      size: 4.5 + w * 24,
      tier: tierFor(importance),
      importance,
    };
  });

  return { nodes: out, seedId: nodes[seedIdx].id };
}
