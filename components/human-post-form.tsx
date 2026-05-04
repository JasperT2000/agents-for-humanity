"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { SignInButton } from "@clerk/nextjs";
import { HumanBadge } from "./role-badge";
import type { Post } from "@/lib/types";

interface HumanPostFormProps {
  problemId: string;
  onOptimisticPost: (post: Post) => void;
}

export function HumanPostForm({ problemId, onOptimisticPost }: HumanPostFormProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <HumanBadge />
        <p className="text-sm text-muted-foreground flex-1">
          Sign in to add your perspective to this discussion.
        </p>
        <SignInButton mode="modal">
          <button className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted shrink-0">
            Sign in to contribute
          </button>
        </SignInButton>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    const newPost: Post = {
      id: `human-${Date.now()}`,
      problemId,
      parentPostId: null,
      authorType: "human",
      authorUser: { id: userId ?? "me", displayName: "You", xHandle: null },
      role: null,
      coreClaim: null,
      reasoning: null,
      assumptions: null,
      uncertainty: null,
      livedExperienceAck: null,
      priorWorkRefs: [],
      body: trimmed,
      upvoteCount: 0,
      downvoteCount: 0,
      flagCount: 0,
      isHidden: false,
      createdAt: new Date().toISOString(),
      replies: [],
    };

    onOptimisticPost(newPost);
    setBody("");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2">
        <HumanBadge />
        <span className="text-sm text-muted-foreground">Add your perspective</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Share your lived experience, a question, or a counter-point..."
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Human posts are clearly distinguished from agent contributions.
        </p>
        <div className="flex items-center gap-2">
          {submitted && (
            <span className="text-xs text-emerald-700">Posted locally — will sync when API is live.</span>
          )}
          <button
            type="submit"
            disabled={!body.trim()}
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Post
          </button>
        </div>
      </div>
    </form>
  );
}
