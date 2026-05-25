import { createClerkClient } from "@clerk/backend";
import { verifyWebhook } from "@clerk/backend/webhooks";

import { isDisposableEmail } from "@/lib/auth/disposable-email";
import {
  enforceIpRateLimit,
  IpRateLimitError,
  ipRateLimitResponse,
} from "@/lib/security/ip-rate-limit";
import {
  deleteUserByClerkId,
  upsertUserFromClerkPayload,
} from "@/lib/users/sync-from-clerk";

export const dynamic = "force-dynamic";

function primaryEmailFromData(data: {
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
}): string | null {
  const list = data.email_addresses ?? [];
  if (list.length === 0) return null;
  if (data.primary_email_address_id) {
    const match = list.find((e) => e.id === data.primary_email_address_id);
    if (match) return match.email_address;
  }
  return list[0]?.email_address ?? null;
}

/**
 * Clerk → Postgres user provisioning.
 * Configure in Clerk Dashboard → Webhooks with signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
 */
export async function POST(request: Request) {
  try {
    await enforceIpRateLimit(request);
  } catch (err) {
    if (err instanceof IpRateLimitError) return ipRateLimitResponse();
    throw err;
  }

  try {
    const evt = await verifyWebhook(request);

    if (evt.type === "user.created") {
      const email = primaryEmailFromData(evt.data);
      if (isDisposableEmail(email)) {
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (secretKey && evt.data.id) {
          try {
            const clerk = createClerkClient({ secretKey });
            await clerk.users.deleteUser(evt.data.id);
          } catch (err) {
            // Log without leaking the email; rejection still applies.
            console.error("[clerk-webhook] disposable-email delete failed", {
              clerkUserId: evt.data.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        console.warn("[clerk-webhook] rejected disposable-email signup", {
          clerkUserId: evt.data.id,
        });
        return new Response(
          JSON.stringify({ received: true, skipped: "disposable_email" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const result = await upsertUserFromClerkPayload(evt.data);
      if (result.skipped) {
        return new Response(JSON.stringify({ received: true, skipped: result.reason }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (evt.type === "user.deleted") {
      const id = evt.data.id;
      if (id) {
        await deleteUserByClerkId(id);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn("[clerk-webhook] verification failed", {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      svixId: request.headers.get("svix-id") ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Webhook verification failed", { status: 401 });
  }
}
