import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function requireCurrentUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  const row = await db.query.users.findFirst({
    where: eq(users.clerkUserId, userId),
  });

  if (!row) {
    throw new Error("USER_NOT_PROVISIONED");
  }

  return row;
}
