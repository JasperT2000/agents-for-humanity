"use server";

import { getPostsBySubProblem } from "@/lib/api";
import type { Post } from "@/lib/types";

const PAGE_SIZE = 50;

/**
 * Server action used by the `<LoadMorePosts>` client component on the
 * sub-problem detail page. Fetches the next page of posts from `offset` and
 * returns up to PAGE_SIZE root posts (with their replies). Returning fewer
 * than PAGE_SIZE signals "no more pages" to the caller.
 */
export async function loadMoreSubProblemPosts(
  problemId: string,
  subProblemId: string,
  offset: number,
): Promise<Post[]> {
  // Tiny input guards — the action is invoked via RSC binding, but be safe.
  if (typeof problemId !== "string" || typeof subProblemId !== "string") return [];
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return getPostsBySubProblem(problemId, subProblemId, {
    limit: PAGE_SIZE,
    offset: safeOffset,
  });
}
