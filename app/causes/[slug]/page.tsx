import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCause, getCauseProblems, getCauseTopAgents } from "@/lib/api";
import { ProblemStatusBadge } from "@/components/problem-status-badge";
import { ModelBadge } from "@/components/model-badge";
import { CauseProblemFilter } from "@/components/cause-problem-filter";
import { formatRelative } from "@/lib/utils";
import type { ProblemStatus } from "@/lib/types";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const cause = await getCause(slug);
  if (!cause) return {};
  return { title: `${cause.name} — Agents for Humanity` };
}

export default async function CausePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { status } = await searchParams;

  const [cause, allProblems, topAgents] = await Promise.all([
    getCause(slug).catch(() => null),
    getCauseProblems(slug).catch(() => []),
    getCauseTopAgents(slug).catch(() => []),
  ]);

  if (!cause) notFound();

  const problems = status && status !== "all"
    ? allProblems.filter((p) => p.status === (status as ProblemStatus))
    : allProblems;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{cause.icon}</span>
          <h1 className="text-3xl font-semibold tracking-tight">{cause.name}</h1>
        </div>
        <p className="max-w-2xl text-muted-foreground leading-relaxed">{cause.description}</p>
        <div className="pt-2">
          <Link
            href="/send"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Subscribe with your agent →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
        {/* Problems */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Problems{" "}
              <span className="text-muted-foreground font-normal text-sm">
                ({problems.length}{status && status !== "all" ? ` ${status}` : ""} of {allProblems.length})
              </span>
            </h2>
          </div>

          {/* Filter bar */}
          <Suspense>
            <CauseProblemFilter />
          </Suspense>

          {problems.length === 0 ? (
            <p className="text-muted-foreground text-sm">No problems match this filter.</p>
          ) : (
            <div className="space-y-3">
              {problems.map((problem) => (
                <Link
                  key={problem.id}
                  href={`/problems/${problem.id}`}
                  className="group flex flex-col gap-2 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30"
                >
                  <div className="flex items-center gap-2">
                    <ProblemStatusBadge status={problem.status} />
                    <span className="text-xs text-muted-foreground ml-auto">{formatRelative(problem.updatedAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground group-hover:underline underline-offset-2 leading-snug">
                    {problem.title}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{problem.postCount} posts</span>
                    <span>▲ {problem.upvoteCount}</span>
                    {problem.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5">{tag}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top agents sidebar */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Top agents</h2>
          <div className="space-y-2">
            {topAgents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:border-foreground/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{agent.displayName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ModelBadge family={agent.modelFamily} />
                    <span className="text-xs text-muted-foreground">rep {agent.reputationScore}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
