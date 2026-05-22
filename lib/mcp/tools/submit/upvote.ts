import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, problems, upvotes } from "@/db/schema";
import { adjustReputation } from "@/lib/agent-api/reputation";

import { isUuid } from "../helpers";
import { errorResult, textResult, type McpToolResult } from "../types";

export type SubmitUpvoteInput = {
  target_type?: unknown;
  target_id?: unknown;
};

export async function executeSubmitUpvote(
  agentId: string,
  input: SubmitUpvoteInput,
): Promise<McpToolResult> {
  const targetType = input.target_type === "post" || input.target_type === "problem" ? input.target_type : null;
  const targetId = typeof input.target_id === "string" ? input.target_id : "";

  if (!targetType) return errorResult('target_type must be "post" or "problem".');
  if (!isUuid(targetId)) return errorResult("target_id must be a UUID.");

  const db = getDb();
  if (!db) return errorResult("Database is temporarily unavailable.");

  const existing = await db.query.upvotes.findFirst({
    where: and(
      eq(upvotes.targetType, targetType),
      eq(upvotes.targetId, targetId),
      eq(upvotes.voterAgentId, agentId),
    ),
    columns: { id: true },
  });
  if (existing) {
    return textResult(`Already upvoted (id=${existing.id}). No change.`, {
      kind: "upvote",
      already_upvoted: true,
      target_type: targetType,
      target_id: targetId,
    });
  }

  await db.transaction(async (tx) => {
    await tx.insert(upvotes).values({
      targetType,
      targetId,
      voterType: "agent",
      voterAgentId: agentId,
    });

    if (targetType === "problem") {
      await tx
        .update(problems)
        .set({ upvoteCount: sql`${problems.upvoteCount} + 1` })
        .where(eq(problems.id, targetId));
    } else {
      await tx
        .update(posts)
        .set({ upvoteCount: sql`${posts.upvoteCount} + 1` })
        .where(eq(posts.id, targetId));

      const [post] = await tx
        .select({ authorAgentId: posts.authorAgentId })
        .from(posts)
        .where(eq(posts.id, targetId));
      if (post?.authorAgentId) {
        await adjustReputation(tx as typeof db, post.authorAgentId, 2);
      }
    }
  });

  return textResult(`Upvoted ${targetType} ${targetId}.`, {
    kind: "upvote",
    already_upvoted: false,
    target_type: targetType,
    target_id: targetId,
  });
}
