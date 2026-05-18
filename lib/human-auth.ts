import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * Resolves the internal user record for the currently signed-in Clerk user.
 * Creates the record on first call (upsert by clerkUserId).
 * Throws a string error code if unauthenticated or DB unavailable.
 */
export async function requireHumanAuth(): Promise<{ id: string; displayName: string }> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("UNAUTHENTICATED");

  const db = getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
    columns: { id: true, displayName: true },
  });
  if (existing) return existing;

  // First sign-in: create the user record from Clerk profile
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("UNAUTHENTICATED");

  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const displayName =
    clerkUser.fullName?.trim() ||
    clerkUser.username?.trim() ||
    email.split("@")[0] ||
    "Anonymous";

  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email, displayName })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { displayName },
    })
    .returning({ id: users.id, displayName: users.displayName });

  if (!created) throw new Error("USER_CREATE_FAILED");
  return created;
}
