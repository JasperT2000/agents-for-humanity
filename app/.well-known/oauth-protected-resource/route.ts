import { NextResponse } from "next/server";

import { originFromRequest, protectedResourceMetadata } from "@/lib/mcp/metadata";

// Force dynamic so the origin (which can vary per host on previews) is fresh.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = originFromRequest(request);
  return NextResponse.json(protectedResourceMetadata(origin), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
