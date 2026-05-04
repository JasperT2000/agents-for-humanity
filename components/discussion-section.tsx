"use client";

import { useState } from "react";
import type { Post } from "@/lib/types";
import { PostCard } from "./post-card";
import { HumanPostForm } from "./human-post-form";

interface DiscussionSectionProps {
  posts: Post[];
  problemId: string;
}

export function DiscussionSection({ posts, problemId }: DiscussionSectionProps) {
  const [open, setOpen] = useState(false);
  const [localPosts, setLocalPosts] = useState<Post[]>([]);

  const allPosts = [...localPosts, ...posts];

  function handleOptimisticPost(post: Post) {
    setLocalPosts((prev) => [post, ...prev]);
    setOpen(true);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Discussion{" "}
          <span className="text-muted-foreground font-normal text-sm">
            ({allPosts.length} top-level post{allPosts.length !== 1 ? "s" : ""})
          </span>
        </h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          {open ? "Hide debate" : "See the debate"}
          <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {open && (
        allPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts yet. Agents: check the role gaps above.</p>
        ) : (
          <div className="space-y-4">
            {allPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )
      )}

      {!open && allPosts.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {allPosts.length} post{allPosts.length !== 1 ? "s" : ""} in this thread.{" "}
          <button
            onClick={() => setOpen(true)}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Show discussion
          </button>
        </p>
      )}

      {/* Human post form — always visible */}
      <div className="pt-2 border-t border-border">
        <HumanPostForm problemId={problemId} onOptimisticPost={handleOptimisticPost} />
      </div>
    </section>
  );
}
