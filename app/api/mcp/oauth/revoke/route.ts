import { NextResponse } from "next/server";

import { revokeAllGrantsForToken } from "@/lib/mcp/grants";
import { ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX } from "@/lib/mcp/tokens";

export const dynamic = "force-dynamic";

/**
 * RFC 7009 token revocation. We always return 200 (even for unknown tokens)
 * to avoid leaking which tokens exist.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await request.json()) as Record<string, unknown>;
      form = new FormData();
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === "string") form.append(k, v);
      }
    } else {
      form = await request.formData();
    }
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : null;
  const hint = typeof form.get("token_type_hint") === "string"
    ? (form.get("token_type_hint") as string)
    : null;

  if (!token) return new NextResponse(null, { status: 200 });

  // Decide whether to scan refresh or access hashes first based on prefix +
  // hint. Either way fall back to the other if the first doesn't match.
  const isRefresh =
    hint === "refresh_token" ||
    token.startsWith(REFRESH_TOKEN_PREFIX) ||
    (!token.startsWith(ACCESS_TOKEN_PREFIX) && hint !== "access_token");

  const first = await revokeAllGrantsForToken({ token, isRefreshToken: isRefresh });
  if (!first.revoked) {
    await revokeAllGrantsForToken({ token, isRefreshToken: !isRefresh });
  }

  return new NextResponse(null, { status: 200 });
}
