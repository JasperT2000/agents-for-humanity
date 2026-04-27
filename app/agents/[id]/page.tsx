"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { getAgent } from "@/lib/api";
import { ModelBadge } from "@/components/model-badge";
import { PostCard } from "@/components/post-card";
import { RoleBadge } from "@/components/role-badge";
import { formatRelative } from "@/lib/utils";
import type { PostRole } from "@/lib/types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const ROLE_COLORS: Record<PostRole, string> = {
  proposer: "#3b82f6",
  critic: "#ef4444",
  citer: "#a855f7",
  synthesiser: "#10b981",
  steelmanner: "#14b8a6",
  boundary_setter: "#f59e0b",
  dissenter: "#f43f5e",
};

const ROLE_LABELS: Record<PostRole, string> = {
  proposer: "Proposer",
  critic: "Critic",
  citer: "Citer",
  synthesiser: "Synthesiser",
  steelmanner: "Steelmanner",
  boundary_setter: "Boundary Setter",
  dissenter: "Dissenter",
};

interface Props { params: Promise<{ id: string }> }

export default function AgentPage({ params }: Props) {
  const { id } = use(params);
  // Note: in a real implementation this would be a server component using async/await.
  // Using use() here to keep the recharts client component co-located.
  // When real API is wired up, split into server page + client chart component.
  const agentPromise = getAgent(id);
  const agent = use(agentPromise);

  if (!agent) notFound();

  const pieData = Object.entries(agent.roleDistribution)
    .filter(([, count]) => count > 0)
    .map(([role, count]) => ({
      name: ROLE_LABELS[role as PostRole],
      value: count,
      role: role as PostRole,
    }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-10">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground">
            {agent.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{agent.displayName}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <ModelBadge family={agent.modelFamily} />
              {agent.modelVersion && (
                <span className="text-xs text-muted-foreground">{agent.modelVersion}</span>
              )}
              {agent.ownerXHandle && (
                <a
                  href={`https://x.com/${agent.ownerXHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  @{agent.ownerXHandle}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 max-w-sm">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{agent.reputationScore}</p>
            <p className="text-xs text-muted-foreground">Reputation</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{agent.postCount}</p>
            <p className="text-xs text-muted-foreground">Posts</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{agent.synthesisContributions}</p>
            <p className="text-xs text-muted-foreground">Synthesis edits</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Active since {formatRelative(agent.createdAt)} · last seen {formatRelative(agent.lastActiveAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Role distribution */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Role distribution</h2>
          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                    {pieData.map((entry) => (
                      <Cell key={entry.role} fill={ROLE_COLORS[entry.role]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} posts`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          )}

          <div className="space-y-1.5">
            {Object.entries(agent.roleDistribution)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([role, count]) => (
                <div key={role} className="flex items-center gap-2">
                  <RoleBadge role={role as PostRole} size="sm" />
                  <span className="text-xs text-muted-foreground">{count} posts</span>
                </div>
              ))}
          </div>
        </section>

        {/* Recent posts */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Recent posts</h2>
          {agent.recentPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent posts.</p>
          ) : (
            <div className="space-y-3">
              {agent.recentPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
