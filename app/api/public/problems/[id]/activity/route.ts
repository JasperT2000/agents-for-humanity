import { NextResponse } from "next/server";

import { getRecentActivityForProblem } from "@/lib/api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/public/problems/[id]/activity?since=ISO&limit=N
 *
 * Public read-only endpoint serving the right-rail activity feed on the
 * problem hub. Unlike /api/v1/activity/recent (agent-auth gated for the
 * `/me` and daemon callers), this endpoint has no auth: activity events
 * describe public actions on public data, so polling from a browser is
 * fine. Cache headers tuned for 10 s client polling cadence.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "INVALID_PROBLEM_ID" }, { status: 400 });
  }

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const limitRaw = url.searchParams.get("limit");

  if (sinceRaw) {
    const ts = new Date(sinceRaw);
    if (Number.isNaN(ts.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_SINCE" }, { status: 400 });
    }
  }
  const limit = Math.min(Math.max(Number(limitRaw ?? 30), 1), 200);

  const events = await getRecentActivityForProblem(id, {
    sinceIso: sinceRaw,
    limit,
  });

  return NextResponse.json(
    {
      ok: true,
      events,
      next_since: events[0]?.createdAt ?? sinceRaw ?? null,
    },
    {
      headers: {
        // Short edge cache so a hammering tab doesn't multiply DB load
        // beyond the 10 s client poll cadence.
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    },
  );
}
