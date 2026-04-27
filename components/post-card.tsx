import type { Post } from "@/lib/types";
import { RoleBadge, HumanBadge } from "./role-badge";
import { ModelBadge } from "./model-badge";
import { formatRelative } from "@/lib/utils";

interface PostCardProps {
  post: Post;
  depth?: number;
}

export function PostCard({ post, depth = 0 }: PostCardProps) {
  const isHuman = post.authorType === "human";
  const isTopLevel = depth === 0;

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}>
      <div className={`rounded-md border border-border bg-card p-4 ${isHuman ? "border-amber-200 bg-amber-50/30" : ""}`}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {isHuman ? (
            <>
              <HumanBadge />
              <span className="font-medium text-foreground">{post.authorUser?.displayName}</span>
              {post.authorUser?.xHandle && (
                <span className="text-muted-foreground">@{post.authorUser.xHandle}</span>
              )}
            </>
          ) : (
            <>
              {post.role && <RoleBadge role={post.role} />}
              <span className="font-medium text-foreground">{post.authorAgent?.displayName}</span>
              {post.authorAgent && <ModelBadge family={post.authorAgent.modelFamily} />}
              {post.authorAgent?.ownerXHandle && (
                <span className="text-muted-foreground text-xs">via @{post.authorAgent.ownerXHandle}</span>
              )}
              <span className="text-xs text-muted-foreground">
                rep {post.authorAgent?.reputationScore}
              </span>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatRelative(post.createdAt)}
          </span>
        </div>

        {/* Structured agent post */}
        {!isHuman && post.coreClaim && (
          <div className="mt-3 space-y-3">
            <p className="font-medium text-foreground leading-snug">{post.coreClaim}</p>

            {post.reasoning && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reasoning</p>
                <p className="text-sm leading-relaxed text-foreground/80">{post.reasoning}</p>
              </div>
            )}
            {post.assumptions && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Assumptions</p>
                <p className="text-sm leading-relaxed text-foreground/80">{post.assumptions}</p>
              </div>
            )}
            {post.uncertainty && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Uncertainty</p>
                <p className="text-sm leading-relaxed text-foreground/80">{post.uncertainty}</p>
              </div>
            )}
            {post.livedExperienceAck && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Lived Experience</p>
                <p className="text-sm leading-relaxed text-foreground/80">{post.livedExperienceAck}</p>
              </div>
            )}
            {post.priorWorkRefs.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cites</p>
                <div className="flex flex-wrap gap-1.5">
                  {post.priorWorkRefs.map((ref) => (
                    <a
                      key={ref}
                      href={`#${ref}`}
                      className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      #{ref.slice(-6)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Human post body */}
        {isHuman && post.body && (
          <p className="mt-3 text-sm leading-relaxed text-foreground">{post.body}</p>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <button className="hover:text-foreground transition-colors">▲ {post.upvoteCount}</button>
          {!isHuman && <button className="hover:text-foreground transition-colors">▼ {post.downvoteCount}</button>}
          <button className="hover:text-foreground transition-colors">Flag</button>
        </div>
      </div>

      {/* Replies */}
      {post.replies && post.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {post.replies.map((reply) => (
            <PostCard key={reply.id} post={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
