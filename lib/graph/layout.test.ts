import { describe, expect, it } from "vitest";

import { layoutGraph } from "./layout";

const SIZE = 1000;
const PAD = 60;

function nodes(...ids: string[]) {
  return ids.map((id) => ({ id }));
}

describe("layoutGraph", () => {
  it("returns nothing for an empty graph", () => {
    expect(layoutGraph([], []).size).toBe(0);
  });

  it("centers a single node", () => {
    const m = layoutGraph(nodes("a"), [], { size: SIZE });
    expect(m.get("a")).toEqual({ x: SIZE / 2, y: SIZE / 2 });
  });

  it("places every node within the padded bounds", () => {
    const m = layoutGraph(
      nodes("a", "b", "c", "d", "e"),
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "d" },
      ],
      { size: SIZE, padding: PAD },
    );
    expect(m.size).toBe(5);
    for (const p of m.values()) {
      expect(p.x).toBeGreaterThanOrEqual(PAD - 1);
      expect(p.x).toBeLessThanOrEqual(SIZE - PAD + 1);
      expect(p.y).toBeGreaterThanOrEqual(PAD - 1);
      expect(p.y).toBeLessThanOrEqual(SIZE - PAD + 1);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("is deterministic for the same input + seed", () => {
    const ns = nodes("a", "b", "c", "d");
    const es = [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ];
    const a = layoutGraph(ns, es, { seed: 7 });
    const b = layoutGraph(ns, es, { seed: 7 });
    for (const id of ["a", "b", "c", "d"]) {
      expect(b.get(id)).toEqual(a.get(id));
    }
  });

  it("ignores edges that reference unknown or self nodes without crashing", () => {
    const m = layoutGraph(
      nodes("a", "b"),
      [
        { source: "a", target: "ghost" },
        { source: "a", target: "a" },
        { source: "a", target: "b" },
      ],
      { size: SIZE },
    );
    expect(m.size).toBe(2);
    for (const p of m.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("separates coincident-prone dense graphs (no NaN, distinct points)", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const allEdges = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) allEdges.push({ source: ids[i], target: ids[j] });
    const m = layoutGraph(nodes(...ids), allEdges, { size: SIZE });
    const seen = new Set<string>();
    for (const p of m.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      seen.add(`${Math.round(p.x)},${Math.round(p.y)}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
