/**
 * Dependency-free, deterministic force-directed layout for the knowledge-graph
 * "brain" view. Kept pure so it can run on the server (stable positions, no
 * client animation jank) and be unit-tested. Node count is expected to be small
 * (capped by the caller), so an O(iterations · n²) Fruchterman–Reingold-style
 * loop is fine.
 */

export interface LayoutNodeInput {
  id: string;
}

export interface LayoutEdgeInput {
  source: string;
  target: string;
}

export interface LaidOutPoint {
  x: number;
  y: number;
}

export interface LayoutOptions {
  /** viewBox size; layout is normalised to fit within [pad, size - pad]. */
  size?: number;
  padding?: number;
  iterations?: number;
  seed?: number;
}

// Small deterministic PRNG (mulberry32) so layouts are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a map of node id → {x, y} in a [0, size] coordinate space, padded by
 * `padding`. Deterministic for a given input + seed. Handles 0 and 1 node.
 */
export function layoutGraph(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  opts: LayoutOptions = {},
): Map<string, LaidOutPoint> {
  const size = opts.size ?? 1000;
  const pad = opts.padding ?? 60;
  const iterations = opts.iterations ?? 320;
  const rand = mulberry32(opts.seed ?? 1);

  const result = new Map<string, LaidOutPoint>();
  const n = nodes.length;
  if (n === 0) return result;
  const center = size / 2;
  if (n === 1) {
    result.set(nodes[0].id, { x: center, y: center });
    return result;
  }

  const ids = nodes.map((nd) => nd.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);

  // Seeded ring init: even angular spread + tiny jitter so symmetric graphs
  // still relax into something legible.
  const initR = size * 0.32;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + (rand() - 0.5) * 0.4;
    xs[i] = center + initR * Math.cos(a) + (rand() - 0.5) * 20;
    ys[i] = center + initR * Math.sin(a) + (rand() - 0.5) * 20;
  }

  // Only consider edges whose endpoints both exist.
  const links = edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]);

  const k = size / Math.sqrt(n); // ideal spacing
  const kRep = k * k; // repulsion constant
  const EPS = 0.01;

  let temp = size * 0.1;
  const cooling = temp / (iterations + 1);

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    dx.fill(0);
    dy.fill(0);

    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = xs[i] - xs[j];
        let vy = ys[i] - ys[j];
        let dist = Math.hypot(vx, vy);
        if (dist < EPS) {
          // Nudge coincident nodes apart deterministically.
          vx = (rand() - 0.5) * EPS;
          vy = (rand() - 0.5) * EPS;
          dist = Math.hypot(vx, vy) || EPS;
        }
        const force = kRep / dist;
        const fx = (vx / dist) * force;
        const fy = (vy / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }

    // Attraction along edges.
    for (const [a, b] of links) {
      const vx = xs[a] - xs[b];
      const vy = ys[a] - ys[b];
      const dist = Math.hypot(vx, vy) || EPS;
      const force = (dist * dist) / k;
      const fx = (vx / dist) * force;
      const fy = (vy / dist) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }

    // Mild centering so disconnected components don't drift away.
    for (let i = 0; i < n; i++) {
      dx[i] += (center - xs[i]) * 0.012;
      dy[i] += (center - ys[i]) * 0.012;
    }

    // Apply, capped by current temperature.
    for (let i = 0; i < n; i++) {
      const disp = Math.hypot(dx[i], dy[i]) || EPS;
      const capped = Math.min(disp, temp);
      xs[i] += (dx[i] / disp) * capped;
      ys[i] += (dy[i] / disp) * capped;
    }
    temp = Math.max(temp - cooling, size * 0.001);
  }

  // Normalise to fit [pad, size - pad] on both axes.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const usable = size - pad * 2;
  for (let i = 0; i < n; i++) {
    result.set(ids[i], {
      x: pad + ((xs[i] - minX) / spanX) * usable,
      y: pad + ((ys[i] - minY) / spanY) * usable,
    });
  }
  return result;
}
