"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { FindingGraphEdge, FindingGraphNode } from "@/lib/api";
import { layoutBrain3D, type BrainTier } from "@/lib/graph/layout3d";

export interface BrainGraphData {
  nodes: FindingGraphNode[];
  edges: FindingGraphEdge[];
}

// Locked blue/cyan aesthetic from the BRIEF (DEMO/js/brain.js).
const TIER_HEX: Record<BrainTier, number> = {
  hot: 0xe8f7ff,
  brt: 0x6dd3ff,
  mid: 0x4eaadc,
  deep: 0x1e4a78,
};
const COLOR_MID = new THREE.Color(0x4eaadc);

function signature(data: BrainGraphData): string {
  const ns = data.nodes
    .map((n) => `${n.id}:${n.weight}`)
    .sort()
    .join(",");
  const es = data.edges
    .map((e) => `${e.source}>${e.target}:${e.type}`)
    .sort()
    .join(",");
  return `${ns}|${es}`;
}

export function BrainGraph3D({ initial }: { initial: BrainGraphData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<FindingGraphNode | null>(null);
  const [count, setCount] = useState({ nodes: initial.nodes.length, edges: initial.edges.length });
  const selectRef = useRef(setSelected);
  selectRef.current = setSelected;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return; // no WebGL — the page still shows the heading + fallback note
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040810);
    scene.fog = new THREE.FogExp2(0x040810, 0.026);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 78);

    const group = new THREE.Group();
    scene.add(group);

    // ---- ambient dust (built once, data-independent) ----
    const dustCount = 600;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 36 + Math.random() * 22;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dustPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      dustPos[i * 3 + 1] = r * Math.cos(ph);
      dustPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 1.0,
      color: 0x4eaadc,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    group.add(new THREE.Points(dustGeo, dustMat));

    // ---- mutable graph state (rebuilt when live data changes) ----
    let nodesById = new Map<string, FindingGraphNode>();
    let localPos = new Float32Array(0); // unrotated node positions, for picking
    let brightness = new Float32Array(0);
    let adjacency: number[][] = [];
    let orderedIds: string[] = [];
    let nodeGeo: THREE.BufferGeometry | null = null;
    let nodeMat: THREE.ShaderMaterial | null = null;
    let nodePoints: THREE.Points | null = null;
    let edgeGeo: THREE.BufferGeometry | null = null;
    let edgeMat: THREE.LineBasicMaterial | null = null;
    let edgeLines: THREE.LineSegments | null = null;
    let awakenTimers: ReturnType<typeof setTimeout>[] = [];

    function teardownGraph() {
      awakenTimers.forEach((t) => clearTimeout(t));
      awakenTimers = [];
      for (const obj of [nodePoints, edgeLines]) {
        if (obj) group.remove(obj);
      }
      nodeGeo?.dispose();
      nodeMat?.dispose();
      edgeGeo?.dispose();
      edgeMat?.dispose();
      nodeGeo = nodeMat = null;
      nodePoints = null;
      edgeGeo = edgeMat = null;
      edgeLines = null;
    }

    function buildGraph(data: BrainGraphData) {
      teardownGraph();
      nodesById = new Map(data.nodes.map((n) => [n.id, n]));
      const layout = layoutBrain3D(
        data.nodes.map((n) => ({ id: n.id, weight: n.weight })),
        data.edges.map((e) => ({ source: e.source, target: e.target })),
      );
      orderedIds = layout.nodes.map((n) => n.id);
      const idToIdx = new Map(orderedIds.map((id, i) => [id, i]));
      const n = layout.nodes.length;

      localPos = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const sizes = new Float32Array(n);
      brightness = new Float32Array(n);
      adjacency = layout.nodes.map(() => []);

      layout.nodes.forEach((nd, i) => {
        localPos[i * 3] = nd.x;
        localPos[i * 3 + 1] = nd.y;
        localPos[i * 3 + 2] = nd.z;
        const c = new THREE.Color(TIER_HEX[nd.tier]);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
        sizes[i] = nd.size;
      });

      for (const e of data.edges) {
        const a = idToIdx.get(e.source);
        const b = idToIdx.get(e.target);
        if (a === undefined || b === undefined || a === b) continue;
        adjacency[a].push(b);
        adjacency[b].push(a);
      }

      nodeGeo = new THREE.BufferGeometry();
      nodeGeo.setAttribute("position", new THREE.BufferAttribute(localPos, 3));
      nodeGeo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      nodeGeo.setAttribute("aBright", new THREE.BufferAttribute(brightness, 1));
      nodeMat = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute vec3 aColor; attribute float aSize; attribute float aBright;
          varying vec3 vColor; varying float vBright; uniform float uPixelRatio;
          void main() {
            vColor = aColor; vBright = aBright;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixelRatio * (220.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vColor; varying float vBright;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            float falloff = smoothstep(0.5, 0.0, d);
            float core = smoothstep(0.18, 0.0, d) * 0.6;
            vec3 col = vColor * (falloff + core);
            float a = (falloff * 0.7 + core) * (0.18 + vBright * 0.95);
            if (a < 0.01) discard;
            gl_FragColor = vec4(col, a);
          }`,
      });
      nodePoints = new THREE.Points(nodeGeo, nodeMat);
      group.add(nodePoints);

      const edgePos: number[] = [];
      const edgeCol: number[] = [];
      for (const e of data.edges) {
        const a = idToIdx.get(e.source);
        const b = idToIdx.get(e.target);
        if (a === undefined || b === undefined || a === b) continue;
        edgePos.push(localPos[a * 3], localPos[a * 3 + 1], localPos[a * 3 + 2]);
        edgePos.push(localPos[b * 3], localPos[b * 3 + 1], localPos[b * 3 + 2]);
        for (let k = 0; k < 2; k++) edgeCol.push(COLOR_MID.r, COLOR_MID.g, COLOR_MID.b);
      }
      edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edgePos), 3));
      edgeGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(edgeCol), 3));
      edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      group.add(edgeLines);

      startAwakening(layout.seedId, idToIdx);
    }

    function startAwakening(seedId: string | null, idToIdx: Map<string, number>) {
      const n = brightness.length;
      if (n === 0) return;
      const seed = seedId !== null ? (idToIdx.get(seedId) ?? 0) : 0;
      const layers: number[][] = [[seed]];
      const visited = new Set([seed]);
      while (layers.length <= 12) {
        const next: number[] = [];
        for (const i of layers[layers.length - 1]) {
          for (const j of adjacency[i]) if (!visited.has(j)) { visited.add(j); next.push(j); }
        }
        if (next.length === 0) break;
        layers.push(next);
      }
      const isolated: number[] = [];
      for (let i = 0; i < n; i++) if (!visited.has(i)) isolated.push(i);
      if (isolated.length) layers.push(isolated);

      const total = 5000;
      const layerDur = total / Math.max(1, layers.length);
      layers.forEach((layer, li) => {
        const id = setTimeout(() => {
          for (const idx of layer) {
            const t0 = performance.now();
            const step = () => {
              const e = (performance.now() - t0) / 800;
              const v = Math.min(1, e);
              brightness[idx] = Math.max(brightness[idx], 1 - Math.pow(1 - v, 2));
              if (nodeGeo) nodeGeo.attributes.aBright.needsUpdate = true;
              if (e < 1) requestAnimationFrame(step);
            };
            step();
          }
        }, li * layerDur);
        awakenTimers.push(id);
      });
    }

    buildGraph(initial);

    // ---- sizing ----
    const resize = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---- picking: screen-project node world positions, pick nearest to click ----
    let camTween = 0;
    let flyTarget: THREE.Vector3 | null = null;
    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      group.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      let bestId: string | null = null;
      let bestDist = 26; // px radius
      for (let i = 0; i < orderedIds.length; i++) {
        v.set(localPos[i * 3], localPos[i * 3 + 1], localPos[i * 3 + 2]);
        v.applyMatrix4(group.matrixWorld).project(camera);
        const sx = (v.x * 0.5 + 0.5) * rect.width;
        const sy = (-v.y * 0.5 + 0.5) * rect.height;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bestDist) { bestDist = d; bestId = orderedIds[i]; }
      }
      if (bestId) {
        const node = nodesById.get(bestId) ?? null;
        selectRef.current(node);
        const i = orderedIds.indexOf(bestId);
        flyTarget = new THREE.Vector3(localPos[i * 3], localPos[i * 3 + 1], localPos[i * 3 + 2]);
        camTween = 0;
      }
    };
    canvas.addEventListener("click", onClick);

    // ---- animation loop ----
    let raf = 0;
    let t = 0;
    let lastFire = 0;
    let flyFrom: THREE.Vector3 | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      t += 0.016;
      group.rotation.y += 0.0025;
      group.rotation.x = Math.sin(t * 0.2) * 0.05;

      // camera ease toward a clicked node (then it just holds)
      if (flyTarget) {
        if (!flyFrom) flyFrom = camera.position.clone();
        camTween = Math.min(1, camTween + 0.02);
        const e = 1 - Math.pow(1 - camTween, 3);
        const len = flyTarget.length() || 1;
        const dest = flyTarget.clone().multiplyScalar((len + 22) / len);
        camera.position.lerpVectors(flyFrom, dest, e);
        camera.lookAt(0, 0, 0);
        if (camTween >= 1) { flyTarget = null; flyFrom = null; }
      }

      // gentle re-firing pulses along edges
      if (t - lastFire > 1.4 + Math.random() * 0.8 && brightness.length) {
        lastFire = t;
        const lit: number[] = [];
        for (let i = 0; i < brightness.length; i++) if (brightness[i] > 0.55) lit.push(i);
        if (lit.length) {
          const src = lit[Math.floor(Math.random() * lit.length)];
          const ns = adjacency[src];
          if (ns && ns.length) {
            const tgt = ns[Math.floor(Math.random() * ns.length)];
            brightness[tgt] = Math.min(1, brightness[tgt] + 0.5);
            if (nodeGeo) nodeGeo.attributes.aBright.needsUpdate = true;
          }
        }
      }
      renderer.render(scene, camera);
    };
    tick();

    // ---- poll for live updates from agents ----
    let curSig = signature(initial);
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/public/findings/graph", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean } & BrainGraphData;
        if (!data.ok) return;
        const sig = signature(data);
        if (sig !== curSig) {
          curSig = sig;
          buildGraph({ nodes: data.nodes, edges: data.edges });
          setCount({ nodes: data.nodes.length, edges: data.edges.length });
        }
      } catch {
        /* transient — try again next tick */
      }
    }, 25000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(poll);
      ro.disconnect();
      canvas.removeEventListener("click", onClick);
      teardownGraph();
      dustGeo.dispose();
      dustMat.dispose();
      renderer.dispose();
    };
  }, [initial]);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-border" style={{ height: "72vh", background: "#040810" }}>
      <canvas ref={canvasRef} className="block h-full w-full" style={{ cursor: "pointer" }} />

      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/30 px-2 py-1 font-mono text-[11px] text-sky-200/80">
        {count.nodes} findings · {count.edges} edges · live
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm rounded-md border border-sky-400/30 bg-[#08111f]/95 p-4 text-sky-50 shadow-lg">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-sky-300/80">
              {selected.confidence === "n/a" ? "confidence n/a" : `${selected.confidence} confidence`}
              {selected.isHumanContribution ? " · human" : ""}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-sky-300/70 hover:text-sky-100 text-xs"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <h2 className="text-sm font-medium leading-snug">{selected.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-sky-100/80">{selected.summary}</p>
          {selected.region && <p className="mt-1 text-[11px] text-sky-300/60">{selected.region}</p>}
          <p className="mt-1 text-[11px] text-sky-300/60">
            weight {selected.weight.toFixed(2)} · cited by {selected.citedByCount} proposal
            {selected.citedByCount === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
