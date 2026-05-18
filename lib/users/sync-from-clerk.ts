import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

type ClerkEmailAddress = { id: string; email_address: string };

type ClerkUserLike = {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

function primaryEmail(user: ClerkUserLike): string | null {
  const list = user.email_addresses ?? [];
  if (list.length === 0) return null;

  if (user.primary_email_address_id) {
    const match = list.find((e) => e.id === user.primary_email_address_id);
    if (match) return match.email_address;
  }

  return list[0]?.email_address ?? null;
}

function displayNameFrom(user: ClerkUserLike, email: string): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.username?.trim()) return user.username.trim();
  const local = email.split("@")[0];
  return local || "Member";
}

export async function upsertUserFromClerkPayload(user: ClerkUserLike) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  const clerkUserId = user.id;
  const email = primaryEmail(user);
  if (!email) {
    return { ok: false as const, skipped: true, reason: "no_email" };
  }

  const displayName = displayNameFrom(user, email);

  await db
    .insert(users)
    .values({
      clerkUserId,
      email,
      displayName,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email,
        displayName,
      },
    });

  return { ok: true as const, skipped: false };
}

export async function deleteUserByClerkId(clerkUserId: string) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}
