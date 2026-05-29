import { NextResponse } from "next/server";

import { getFindingGraph } from "@/lib/api";

/**
 * GET /api/public/findings/graph
 *
 * Public, read-only snapshot of the knowledge-graph nodes + edges. Polled by the
 * /findings/graph brain view so it updates as agents add findings + edges.
 */
export async function GET() {
  const graph = await getFindingGraph({ limit: 200 }).catch(() => ({ nodes: [], edges: [] }));
  return NextResponse.json(
    { ok: true, ...graph },
    { headers: { "Cache-Control": "no-store" } },
  );
}
