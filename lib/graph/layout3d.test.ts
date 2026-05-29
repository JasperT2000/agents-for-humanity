import { describe, expect, it } from "vitest";

import { layoutBrain3D } from "./layout3d";

const w = (id: string, weight = 0.5) => ({ id, weight });

describe("layoutBrain3D", () => {
  it("handles an empty graph", () => {
    expect(layoutBrain3D([], [])).toEqual({ nodes: [], seedId: null });
  });

  it("produces finite coordinates for every node", () => {
    const { nodes } = layoutBrain3D(
      [w("a"), w("b"), w("c")],
      [{ source: "a", target: "b" }],
    );
    expect(nodes).toHaveLength(3);
    for (const nd of nodes) {
      expect(Number.isFinite(nd.x) && Number.isFinite(nd.y) && Number.isFinite(nd.z)).toBe(true);
    }
  });

  it("is deterministic for the same input", () => {
    const ns = [w("a", 0.9), w("b", 0.2), w("c", 0.6)];
    const es = [{ source: "a", target: "b" }];
    expect(layoutBrain3D(ns, es)).toEqual(layoutBrain3D(ns, es));
  });

  it("seeds on the most-connected node", () => {
    const { seedId } = layoutBrain3D(
      [w("a"), w("hub"), w("b"), w("c")],
      [
        { source: "hub", target: "a" },
        { source: "hub", target: "b" },
        { source: "hub", target: "c" },
      ],
    );
    expect(seedId).toBe("hub");
  });

  it("pulls well-connected nodes nearer the core than isolated ones", () => {
    const { nodes } = layoutBrain3D(
      [w("hub"), w("a"), w("b"), w("lonely")],
      [
        { source: "hub", target: "a" },
        { source: "hub", target: "b" },
      ],
    );
    const radius = (id: string) => {
      const nd = nodes.find((x) => x.id === id)!;
      return Math.hypot(nd.x, nd.y, nd.z);
    };
    expect(radius("hub")).toBeLessThan(radius("lonely"));
  });

  it("sizes nodes by weight and tiers by connectivity", () => {
    const { nodes } = layoutBrain3D(
      [w("big", 1), w("small", 0)],
      [],
    );
    const big = nodes.find((x) => x.id === "big")!;
    const small = nodes.find((x) => x.id === "small")!;
    expect(big.size).toBeGreaterThan(small.size);
    // no edges → everyone is the lowest tier
    expect(nodes.every((nd) => nd.tier === "deep")).toBe(true);
  });

  it("ignores edges with unknown or self endpoints", () => {
    const { nodes, seedId } = layoutBrain3D(
      [w("a"), w("b")],
      [
        { source: "a", target: "ghost" },
        { source: "a", target: "a" },
      ],
    );
    expect(nodes).toHaveLength(2);
    expect(seedId).not.toBeNull();
  });
});
