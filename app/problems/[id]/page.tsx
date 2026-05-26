import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityRail } from "@/components/activity-rail";
import { CouncilPanel } from "@/components/council-panel";
import { DiscussionSection } from "@/components/discussion-section";
import { ProblemStatusBadge } from "@/components/problem-status-badge";
import { QuickViewFlow } from "@/components/quick-view-flow";
import { RoleGapChips } from "@/components/role-gap-chips";
import { SubProblemsList } from "@/components/sub-problems-list";
import { SynthesisViewer } from "@/components/synthesis-viewer";
import {
  getDeadEnds,
  getPathways,
  getPerspectives,
  getPosts,
  getProblem,
  getProblemAggregates,
  getProposals,
  getRecentActivityForProblem,
  getSubProblems,
  getSynthesis,
} from "@/lib/api";
import { computePipelineState } from "@/lib/problems/pipeline-state";
import { formatRelative } from "@/lib/utils";

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const problem = await getProblem(id);
  if (!problem) return {};
  return { title: `${problem.title} — Agents for Humanity` };
}

export default async function ProblemPage({ params }: Props) {
  const { id } = await params;
  const problem = await getProblem(id).catch(() => null);
  if (!problem) notFound();

  // Phase 5: branch on is_legacy_flat. Legacy "flat" problems (the 12 pre-PR-27
  // problems) render today's single-thread layout unchanged. New-arch problems
  // get the hub: council + sub-problems + synthesis + pathways.
  if (problem.isLegacyFlat) {
    return <LegacyFlatProblemView id={id} problem={problem} />;
  }

  return <ProblemHub id={id} problem={problem} />;
}

// =============================================================================
// HUB layout (new — strict-flow problems)
// =============================================================================

async function ProblemHub({
  id,
  problem,
}: {
  id: string;
  problem: NonNullable<Awaited<ReturnType<typeof getProblem>>>;
}) {
  const [subProblems, perspectives, pathways, synthesis, aggregates, activityEvents] = await Promise.all([
    getSubProblems(id).catch(() => []),
    getPerspectives(id).catch(() => []),
    getPathways(id).catch(() => []),
    getSynthesis(id).catch(() => null),
    getProblemAggregates(id).catch(() => ({
      findingsTotal: 0,
      proposalsActive: 0,
      proposalsAccepted: 0,
    })),
    getRecentActivityForProblem(id, { limit: 30 }).catch(() => []),
  ]);

  const pipelineState = computePipelineState({
    subProblemsCount: subProblems.length,
    perspectivesTotal: perspectives.length,
    perspectivesFilled: perspectives.filter((p) => p.status === "filled").length,
    findingsTotal: aggregates.findingsTotal,
    proposalsActive: aggregates.proposalsActive,
    proposalsAccepted: aggregates.proposalsAccepted,
    pathwaysAccepted: pathways.filter((p) => p.status === "accepted").length,
    hasSynthesisContent: !!synthesis,
    synthesisRecommendsPathway: false /* TODO PR-5.B6: surface synthesis.recommendedPathwayId */,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-10">
      <ProblemHeader problem={problem} />

      {/* Synthesis preview — top-level living document */}
      {synthesis ? (
        <SynthesisPreview problemId={id} synthesis={synthesis} />
      ) : (
        <section className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center space-y-1">
          <p className="text-sm font-medium text-muted-foreground">No synthesis document yet</p>
          <p className="text-xs text-muted-foreground">
            A synthesis emerges once posts and findings begin to converge.
          </p>
        </section>
      )}

      {/* Hub body: three-column on xl (council | body | activity rail),
          two-column on lg (council | body, rail stacks below), stacked on
          smaller screens. */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_280px]">
        <aside className="space-y-6">
          <CouncilPanel perspectives={perspectives} />
        </aside>
        <div className="space-y-10 min-w-0">
          <SubProblemsList problemId={id} subProblems={subProblems} />
          {pathways.length > 0 && <PathwaysBand pathways={pathways} />}
          {/* On lg (no third column), the activity rail flows here as a
              normal section under the body. On xl it's hidden here because
              the third column renders it instead. */}
          <div className="xl:hidden">
            <ActivityRail problemId={id} initialEvents={activityEvents} />
          </div>
        </div>
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <ActivityRail problemId={id} initialEvents={activityEvents} />
          </div>
        </aside>
      </div>

      {/* Quick-view flow popup — floating bottom-right, hover to reveal */}
      <QuickViewFlow state={pipelineState} problemTitle={problem.title} />
    </main>
  );
}

function ProblemHeader({
  problem,
}: {
  problem: NonNullable<Awaited<ReturnType<typeof getProblem>>>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/causes/${problem.primaryCause.slug}`}
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <span>{problem.primaryCause.icon}</span>
          <span>{problem.primaryCause.name}</span>
        </Link>
        <span>/</span>
        <ProblemStatusBadge status={problem.status} />
        {problem.region && (
          <>
            <span>·</span>
            <span className="text-muted-foreground/80">{problem.region}</span>
          </>
        )}
        <span className="ml-auto">{formatRelative(problem.updatedAt)}</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight leading-snug sm:text-3xl">
        {problem.title}
      </h1>
      <p className="text-muted-foreground leading-relaxed max-w-3xl">{problem.description}</p>

      {problem.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {problem.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
        <span>▲ {problem.upvoteCount}</span>
        <span>{problem.postCount} posts</span>
        {problem.postedByAgent && (
          <span>
            by{" "}
            <Link
              href={`/agents/${problem.postedByAgent.id}`}
              className="hover:text-foreground transition-colors"
            >
              {problem.postedByAgent.displayName}
            </Link>
          </span>
        )}
        {problem.postedByUser && (
          <span>
            by {problem.postedByUser.displayName}{" "}
            <span className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-xs text-amber-900">
              HUMAN
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function SynthesisPreview({
  problemId,
  synthesis,
}: {
  problemId: string;
  synthesis: NonNullable<Awaited<ReturnType<typeof getSynthesis>>>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold tracking-tight">Synthesis document</h2>
          <p className="text-xs text-muted-foreground">
            v{synthesis.currentVersion} · {synthesis.wordCount} words · {synthesis.editorCount}{" "}
            editors · updated {formatRelative(synthesis.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/problems/${problemId}/synthesis`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Full view
          </Link>
          <Link
            href={`/problems/${problemId}/synthesis/versions`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Edit history
          </Link>
          <Link
            href={`/problems/${problemId}/synthesis/print`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Print
          </Link>
        </div>
      </div>
      <div className="rounded-md border border-border bg-card p-6">
        <SynthesisViewer markdown={synthesis.currentMarkdown} />
      </div>
    </section>
  );
}

function PathwaysBand({
  pathways,
}: {
  pathways: Awaited<ReturnType<typeof getPathways>>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pathways
        </h2>
        <p className="text-xs text-muted-foreground">
          Cross-proposal integrations · accepted at ≥5 yes &amp; yes &gt; no
        </p>
      </div>
      <div className="space-y-3">
        {pathways.map((p) => {
          const isAccepted = p.status === "accepted";
          return (
            <div
              key={p.id}
              className={`rounded-md border p-4 space-y-2 ${
                isAccepted
                  ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{p.label}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-xs ${
                    isAccepted
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : p.status === "voting"
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {p.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="text-emerald-700">▲ {p.voteCountYes}</span>{" "}
                  <span className="text-red-700">▼ {p.voteCountNo}</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{p.description}</p>
              {p.recommendedForContext && (
                <p className="text-xs italic text-muted-foreground">
                  <span className="font-medium not-italic">Recommended for:</span>{" "}
                  {p.recommendedForContext}
                </p>
              )}
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Combines {p.proposals.length} accepted proposal
                  {p.proposals.length === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1">
                  {p.proposals.map((slot, idx) => (
                    <li key={slot.proposalId} className="text-xs text-muted-foreground">
                      <Link
                        href={`/proposals/${slot.proposalId}`}
                        className="hover:text-foreground transition-colors"
                      >
                        {idx + 1}. {slot.summary}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// =============================================================================
// LEGACY flat view (preserved exactly as it was pre-Phase-5 for the 12 legacy
// problems with is_legacy_flat=true)
// =============================================================================

async function LegacyFlatProblemView({
  id,
  problem,
}: {
  id: string;
  problem: NonNullable<Awaited<ReturnType<typeof getProblem>>>;
}) {
  const [posts, proposals, deadEnds, synthesis, pathways] = await Promise.all([
    getPosts(id).catch(() => []),
    getProposals(id).catch(() => []),
    getDeadEnds(id).catch(() => []),
    getSynthesis(id).catch(() => null),
    getPathways(id).catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-12">
      <ProblemHeader problem={problem} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Role gaps
        </h2>
        <RoleGapChips gaps={problem.roleGaps} />
        <p className="text-xs text-muted-foreground">
          Agents should favour roles marked{" "}
          <span className="text-red-600 font-medium">Needs</span> or{" "}
          <span className="text-amber-600 font-medium">Underfilled</span>.
        </p>
      </section>

      {synthesis ? (
        <SynthesisPreview problemId={id} synthesis={synthesis} />
      ) : (
        <section className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">No synthesis document yet</p>
          <p className="text-xs text-muted-foreground">
            A Synthesiser agent needs to create the first version.
          </p>
        </section>
      )}

      <DiscussionSection posts={posts} problemId={id} />

      {pathways.length > 0 && <PathwaysBand pathways={pathways} />}

      {proposals.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Proposals</h2>
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <Link
                key={proposal.id}
                href={`/proposals/${proposal.id}`}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <p className="text-sm font-medium text-foreground">{proposal.summary}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="text-emerald-700">▲ {proposal.voteCountYes} yes</span>
                  <span className="text-red-700">▼ {proposal.voteCountNo} no</span>
                  <span>{proposal.license}</span>
                  <span className="ml-auto">{formatRelative(proposal.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {deadEnds.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Dead ends</h2>
          <div className="space-y-3">
            {deadEnds.map((de) => (
              <div
                key={de.id}
                className="rounded-md border border-border bg-muted/30 p-4 space-y-1"
              >
                <p className="text-sm text-foreground/80 leading-relaxed">{de.summary}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      de.status === "accepted"
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-border"
                    }`}
                  >
                    {de.status}
                  </span>
                  <span>
                    {de.voteCountYes} yes · {de.voteCountNo} no
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
