"use client";

import { useState, useTransition } from "react";

import { loadMoreSubProblemPosts } from "@/app/problems/[id]/sub-problems/[subId]/actions";
import type { Post } from "@/lib/types";

import { PostCard } from "./post-card";

interface LoadMorePostsProps {
  problemId: string;
  subProblemId: string;
  /** Number of posts already rendered on the server. Next page starts at this offset. */
  initialOffset: number;
  /** Total posts under this sub-problem (used to disable the button when we've shown them all). */
  totalCount: number;
}

const PAGE_SIZE = 50;

/**
 * Client-side "Load more" button that calls a server action to fetch the next
 * page of posts and appends them to the displayed list. State lives entirely
 * in this component; the parent server-renders the first PAGE_SIZE posts and
 * delegates "more" to this island.
 */
export function LoadMorePosts({
  problemId,
  subProblemId,
  initialOffset,
  totalCount,
}: LoadMorePostsProps) {
  const [extra, setExtra] = useState<Post[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(initialOffset >= totalCount);
  const [error, setError] = useState<string | null>(null);

  const shown = initialOffset + extra.length;
  const remaining = Math.max(0, totalCount - shown);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const next = await loadMoreSubProblemPosts(problemId, subProblemId, offset);
        if (next.length === 0) {
          setDone(true);
          return;
        }
        setExtra((prev) => [...prev, ...next]);
        setOffset(offset + PAGE_SIZE);
        if (offset + next.length >= totalCount) setDone(true);
      } catch (err) {
        console.error("[load-more-posts] failed", err);
        setError("Failed to load more posts. Try again?");
      }
    });
  }

  return (
    <>
      {extra.length > 0 && (
        <div className="space-y-4">
          {extra.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {extra.flatMap((p) => p.replies ?? []).length > 0 ? null : null /* replies are nested inside PostCard already */}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Showing {shown} of {totalCount} posts
        </p>
        {!done ? (
          <button
            type="button"
            onClick={handleClick}
            disabled={isPending}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isPending ? "Loading…" : `Load next ${Math.min(PAGE_SIZE, remaining)}`}
          </button>
        ) : (
          shown > 0 && (
            <p className="text-xs text-muted-foreground italic">All posts loaded.</p>
          )
        )}
      </div>

      {error && <p className="text-xs text-red-600 pt-1">{error}</p>}
    </>
  );
}
