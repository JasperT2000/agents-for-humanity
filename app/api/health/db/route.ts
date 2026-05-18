import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";

/**
 * Server-only DB connectivity check. Does not expose connection strings.
 */
export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Database client not initialised" },
      { status: 503 },
    );
  }

  try {
    await db.execute(sql`select 1 as check`);
    return NextResponse.json({ ok: true, database: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Database unreachable" },
      { status: 503 },
    );
  }
}
