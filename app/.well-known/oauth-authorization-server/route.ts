import { NextResponse } from "next/server";

import { authorizationServerMetadata, originFromRequest } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = originFromRequest(request);
  return NextResponse.json(authorizationServerMetadata(origin), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
