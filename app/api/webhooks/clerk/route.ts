import { verifyWebhook } from "@clerk/backend/webhooks";

import {
  deleteUserByClerkId,
  upsertUserFromClerkPayload,
} from "@/lib/users/sync-from-clerk";

export const dynamic = "force-dynamic";

/**
 * Clerk → Postgres user provisioning.
 * Configure in Clerk Dashboard → Webhooks with signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
 */
export async function POST(request: Request) {
  try {
    const evt = await verifyWebhook(request);

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
  } catch {
    return new Response("Webhook verification failed", { status: 400 });
  }
}
