import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function createSupabaseServerClient() {
  const { getToken } = await auth();
  const template = process.env.CLERK_SUPABASE_JWT_TEMPLATE ?? "supabase";
  const token = await getToken({ template });

  if (!token) {
    throw new Error(
      `Clerk token template "${template}" is missing or not configured for this user`,
    );
  }

  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured",
    );
  }

  return createClient(url, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
