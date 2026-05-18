import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Verifies Clerk -> Supabase JWT mapping for RLS-protected queries.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated with Clerk" },
      { status: 401 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, clerk_user_id")
      .eq("clerk_user_id", userId)
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      clerkUserId: userId,
      mappedUser: data?.[0] ?? null,
      mapped: Boolean(data?.length),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
