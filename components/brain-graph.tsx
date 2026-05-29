"use client";

import { useMemo, useState } from "react";

import type { FindingConfidence } from "@/lib/types";

export interface BrainNode {
  id: string;
  title: string;
  summary: string;
  confidence: FindingConfidence;
  weight: number;
  region: string | null;
  isHumanContribution: boolean;
  x: number;
  y: number;
}

export interface BrainEdge {
  source: string;
  target: string;
  type: "supports" | "contradicts" | "elaborates";
  strength: number;
}

const SIZE = 1000;

const CONFIDENCE_FILL: Record<FindingConfidence, string> = {
  high: "#059669", // emerald-600
  medium: "#d97706", // amber-600
  low: "#e11d48", // rose-600
  na: "#94a3b8", // slate-400
};

const EDGE_COLOR: Record<BrainEdge["type"], string> = {
  supports: "#10b981",
  contradicts: "#ef4444",
  elaborates: "#6366f1",
};

function radius(weight: number): number {
  // weight 0..1 → r 7..24
  const w = Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0.5;
  return 7 + w * 17;
}

export function BrainGraph({ nodes, edges }: { nodes: BrainNode[]; edges: BrainEdge[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Which edges/nodes are emphasised given the active (hover or selected) node.
  const activeId = hoverId ?? selectedId;
  const neighbours = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const e of edges) {
      if (e.source === activeId) set.add(e.target);
      if (e.target === activeId) set.add(e.source);
    }
    return set;
  }, [activeId, edges]);

  const selected = selectedId ? pos.get(selectedId) ?? null : null;

  if (nodes.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No findings yet — the brain grows as agents add evidence and link findings together.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full h-auto"
          role="img"
          aria-label="Knowledge graph of findings"
        >
          {/* edges */}
          <g>
            {edges.map((e, i) => {
              const a = pos.get(e.source);
              const b = pos.get(e.target);
              if (!a || !b) return null;
              const dim = neighbours && !(neighbours.has(e.source) && neighbours.has(e.target));
              return (
                <line
                  key={`${e.source}-${e.target}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={EDGE_COLOR[e.type]}
                  strokeWidth={1 + e.strength * 2.5}
                  strokeOpacity={dim ? 0.08 : 0.35 + e.strength * 0.4}
                />
              );
            })}
          </g>
          {/* nodes */}
          <g>
            {nodes.map((n) => {
              const dim = neighbours && !neighbours.has(n.id);
              const isActive = activeId === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => setSelectedId((cur) => (cur === n.id ? null : n.id))}
                >
                  <circle
                    r={radius(n.weight)}
                    fill={CONFIDENCE_FILL[n.confidence] ?? CONFIDENCE_FILL.na}
                    fillOpacity={0.85}
                    stroke={n.isHumanContribution ? "#b45309" : isActive ? "#0f172a" : "#ffffff"}
                    strokeWidth={n.isHumanContribution ? 3 : isActive ? 2.5 : 1.5}
                  />
                  {(isActive || n.weight >= 0.85) && (
                    <text
                      x={radius(n.weight) + 4}
                      y={4}
                      fontSize={13}
                      fill="#0f172a"
                      style={{ pointerEvents: "none" }}
                    >
                      {n.title.length > 36 ? `${n.title.slice(0, 36)}…` : n.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside className="space-y-4">
        {selected ? (
          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: CONFIDENCE_FILL[selected.confidence] ?? CONFIDENCE_FILL.na }}
              />
              <span className="uppercase tracking-wider text-muted-foreground">
                {selected.confidence === "na" ? "confidence n/a" : `${selected.confidence} confidence`}
              </span>
              {selected.isHumanContribution && (
                <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                  human
                </span>
              )}
            </div>
            <h2 className="font-medium leading-snug">{selected.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{selected.summary}</p>
            {selected.region && (
              <p className="text-xs text-muted-foreground">{selected.region}</p>
            )}
            <p className="text-xs text-muted-foreground">weight {selected.weight.toFixed(2)}</p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Click a node to inspect a finding. Node size = weight; colour = confidence; ringed nodes
            are human testimonies.
          </div>
        )}

        <div className="rounded-md border border-border bg-card p-4 space-y-2 text-xs">
          <div className="font-medium uppercase tracking-wider text-muted-foreground">Edges</div>
          {(["supports", "contradicts", "elaborates"] as const).map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-6" style={{ background: EDGE_COLOR[t] }} />
              <span className="text-muted-foreground">{t}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
