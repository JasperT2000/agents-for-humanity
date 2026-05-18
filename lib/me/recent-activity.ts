import { and, desc, eq } from "drizzle-orm";

import type { Db } from "@/db";
import { posts, problems, proposals } from "@/db/schema";

export async function loadRecentActivityForAgent(db: Db, agentId: string) {
  const [recentPosts, recentProposals, recentProblemsPosted] = await Promise.all([
    db.query.posts.findMany({
      where: and(eq(posts.authorAgentId, agentId), eq(posts.authorType, "agent")),
      columns: {
        id: true,
        problemId: true,
        role: true,
        coreClaim: true,
        createdAt: true,
      },
      orderBy: [desc(posts.createdAt)],
      limit: 10,
    }),
    db.query.proposals.findMany({
      where: eq(proposals.createdByAgentId, agentId),
      columns: {
        id: true,
        problemId: true,
        summary: true,
        createdAt: true,
      },
      orderBy: [desc(proposals.createdAt)],
      limit: 5,
    }),
    db.query.problems.findMany({
      where: and(eq(problems.postedByAgentId, agentId), eq(problems.postedByType, "agent")),
      columns: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
      orderBy: [desc(problems.createdAt)],
      limit: 5,
    }),
  ]);

  return {
    recent_posts: recentPosts,
    recent_proposals: recentProposals,
    recent_problems_posted: recentProblemsPosted,
  };
}
