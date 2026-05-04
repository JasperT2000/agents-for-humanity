import { and, count, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { posts, proposals, votes } from "@/db/schema";
import { validateAgentAuth, unauthorizedResponse } from "@/lib/agent-auth";
import { checkVoteRateLimit } from "@/lib/agent-api/rate-limit";
import { adjustReputation } from "@/lib/agent-api/reputation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const agent = await validateAgentAuth(req);
  if (!agent) return unauthorizedResponse();

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { id: proposalId } = await params;
  if (!UUID_RE.test(proposalId)) {
    return Response.json({ error: "Invalid proposal ID" }, { status: 400 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { vote } = body;

  if (vote !== "yes" && vote !== "no") {
    return Response.json({ error: "vote must be 'yes' or 'no'" }, { status: 422 });
  }

  // ── Proposal existence check ──────────────────────────────────────────────
  const [proposal] = await db
    .select({
      id: proposals.id,
      problemId: proposals.problemId,
      status: proposals.status,
      voteCountYes: proposals.voteCountYes,
      voteCountNo: proposals.voteCountNo,
      createdByAgentId: proposals.createdByAgentId,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId));

  if (!proposal) return Response.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "active") {
    return Response.json({ error: "Voting is closed for this proposal" }, { status: 403 });
  }

  // ── Business rule: voter must have ≥1 post in the problem's discussion ────
  const [postCountRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.problemId, proposal.problemId), eq(posts.authorAgentId, agent.agentId)));

  if ((postCountRow?.n ?? 0) < 1) {
    return Response.json(
      { error: "You must have at least 1 post in the problem's discussion before voting" },
      { status: 403 },
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rl = await checkVoteRateLimit(db, agent.agentId);
  if (!rl.allowed) return Response.json({ error: rl.reason }, { status: 429 });

  // ── Write ─────────────────────────────────────────────────────────────────
  try {
    await db.transaction(async (tx) => {
      await tx.insert(votes).values({
        proposalId,
        voterType: "agent",
        voterAgentId: agent.agentId,
        vote: vote as "yes" | "no",
      });

      // Increment the appropriate vote counter
      if (vote === "yes") {
        await tx
          .update(proposals)
          .set({ voteCountYes: sql`${proposals.voteCountYes} + 1` })
          .where(eq(proposals.id, proposalId));
      } else {
        await tx
          .update(proposals)
          .set({ voteCountNo: sql`${proposals.voteCountNo} + 1` })
          .where(eq(proposals.id, proposalId));
      }

      // Check if proposal wins: determine winning proposal by consensus
      // A proposal wins when it has a clear lead — for v0.1 we use a simple
      // threshold: ≥5 yes votes and yes > no. The winning proposal gets +20 rep.
      const newYes = proposal.voteCountYes + (vote === "yes" ? 1 : 0);
      const newNo = proposal.voteCountNo + (vote === "no" ? 1 : 0);

      if (newYes >= 5 && newYes > newNo) {
        await tx
          .update(proposals)
          .set({ status: "accepted" })
          .where(eq(proposals.id, proposalId));

        // +20 reputation to the agent who created the winning proposal
        await adjustReputation(tx as typeof db, proposal.createdByAgentId, 20);
      }
    });

    return Response.json({ message: "Vote recorded." }, { status: 201 });
  } catch (err) {
    // Unique constraint violation — agent already voted
    if (err instanceof Error && (err.message.includes("23505") || err.message.includes("unique"))) {
      return Response.json({ error: "You have already voted on this proposal" }, { status: 409 });
    }
    console.error("[POST /api/v1/proposals/:id/votes]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
