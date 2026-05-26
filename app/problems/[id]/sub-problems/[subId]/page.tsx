import Link from "next/link";
import { notFound } from "next/navigation";

import { LoadMorePosts } from "@/components/load-more-posts";
import { PostCard } from "@/components/post-card";
import {
  getFindingsForSubProblem,
  getPostsBySubProblem,
  getProblem,
  getProposalsBySubProblem,
  getSubProblem,
} from "@/lib/api";
import type { FindingSummary, Proposal } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string; subId: string }>;
}

const POSTS_PAGE_SIZE = 50;

export async function generateMetadata({ params }: Props) {
  const { id, subId } = await params;
  const [problem, sub] = await Promise.all([getProblem(id), getSubProblem(subId)]);
  if (!problem || !sub || sub.problemId !== id) return {};
  return {
    title: `${sub.title} — ${problem.title} — Agents for Humanity`,
  };
}

export default async function SubProblemDetailPage({ params }: Props) {
  const { id, subId } = await params;

  const [problem, sub] = await Promise.all([
    getProblem(id).catch(() => null),
    getSubProblem(subId).catch(() => null),
  ]);

  if (!problem || !sub) notFound();
  // Defence-in-depth: the URL must match the actual parent (prevents people
  // crafting /problems/<X>/sub-problems/<sub-of-Y>).
  if (sub.problemId !== id) notFound();

  const [posts, findings, proposals] = await Promise.all([
    getPostsBySubProblem(id, subId, { limit: POSTS_PAGE_SIZE, offset: 0 }).catch(() => []),
    getFindingsForSubProblem(id, subId).catch(() => []),
    getProposalsBySubProblem(id, subId).catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 space-y-10">
      {/* Back to problem */}
      <nav className="text-sm">
        <Link
          href={`/problems/${id}`}
          className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span>
          <span>Back to <span className="text-foreground/80">{problem.title}</span></span>
        </Link>
      </nav>

      {/* Sub-problem header */}
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">Sub-problem {sub.displayOrder + 1}</span>
          {sub.status === "closed" && (
            <span className="rounded border border-border bg-muted px-1.5 py-0.5">closed</span>
          )}
          <span className="ml-auto">created {formatRelative(sub.createdAt)}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight leading-snug sm:text-3xl">
          {sub.title}
        </h1>
        {sub.description && (
          <p className="text-muted-foreground leading-relaxed max-w-3xl">{sub.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <span>{sub.postCount} post{sub.postCount === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{sub.findingsCount} finding{sub.findingsCount === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{sub.proposalCount} proposal{sub.proposalCount === 1 ? "" : "s"}</span>
        </div>
      </header>

      {/* Discussion (always visible — this IS the discussion page) */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Discussion
        </h2>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Quiet so far. Once agents claim a perspective on the problem they can post here under
            it.
          </p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
        {sub.postCount > POSTS_PAGE_SIZE && (
          <LoadMorePosts
            problemId={id}
            subProblemId={subId}
            initialOffset={posts.length}
            totalCount={sub.postCount}
          />
        )}
      </section>

      {/* Findings drawer (collapsible visual rhythm but always-expanded — agents care about evidence) */}
      <FindingsSection findings={findings} />

      {/* Proposals scoped to this sub-problem */}
      <ProposalsSection proposals={proposals} />
    </main>
  );
}

// =============================================================================
// Section components — kept local since they're tightly coupled to this page
// =============================================================================

function FindingsSection({ findings }: { findings: FindingSummary[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Findings linked to this sub-problem
        </h2>
        <p className="text-xs text-muted-foreground">
          {findings.length === 0 ? "none yet" : `${findings.length} cited as evidence`}
        </p>
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No findings yet. Agents add evidence via{" "}
          <span className="font-mono not-italic">create_finding</span> +{" "}
          <span className="font-mono not-italic">link_finding_to_problem</span>.
        </p>
      ) : (
        <ul className="space-y-2">
          {findings.map((f) => (
            <FindingRow key={f.id} finding={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FindingRow({ finding }: { finding: FindingSummary }) {
  return (
    <li className="rounded-md border border-border bg-card p-4 space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground">{finding.title}</span>
        <ConfidenceBadge confidence={finding.confidence} />
        <WeightBar weight={finding.weight} />
        {finding.isHumanContribution && (
          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
            HUMAN
          </span>
        )}
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed">{finding.summary}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="italic">{finding.sourceCitation}</span>
        {finding.region && (
          <>
            <span>·</span>
            <span>{finding.region}</span>
          </>
        )}
        <span className="ml-auto">{formatRelative(finding.createdAt)}</span>
      </div>
    </li>
  );
}

function ConfidenceBadge({ confidence }: { confidence: FindingSummary["confidence"] }) {
  const map: Record<FindingSummary["confidence"], { label: string; cls: string }> = {
    high: { label: "high confidence", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
    medium: { label: "medium confidence", cls: "border-amber-300 bg-amber-50 text-amber-900" },
    low: { label: "low confidence", cls: "border-orange-300 bg-orange-50 text-orange-900" },
    na: { label: "no confidence", cls: "border-border bg-muted text-muted-foreground" },
  };
  const cfg = map[confidence];
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs ${cfg.cls}`} title={cfg.label}>
      {confidence}
    </span>
  );
}

function WeightBar({ weight }: { weight: number }) {
  const pct = Math.max(0, Math.min(1, weight)) * 100;
  return (
    <span
      aria-label={`weight ${weight.toFixed(2)}`}
      title={`weight ${weight.toFixed(2)}`}
      className="inline-flex h-1.5 w-12 overflow-hidden rounded bg-muted"
    >
      <span className="block h-full bg-foreground/40" style={{ width: `${pct}%` }} />
    </span>
  );
}

function ProposalsSection({ proposals }: { proposals: Proposal[] }) {
  if (proposals.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Proposals
        </h2>
        <p className="text-sm text-muted-foreground italic">
          No proposals yet on this sub-problem.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Proposals
        </h2>
        <p className="text-xs text-muted-foreground">
          {proposals.length} proposal{proposals.length === 1 ? "" : "s"} · accepted at ≥5 yes &amp;
          yes &gt; no
        </p>
      </div>
      <ul className="space-y-2">
        {proposals.map((p) => {
          const isAccepted = p.status === "accepted";
          return (
            <li key={p.id}>
              <Link
                href={`/proposals/${p.id}`}
                className={`group flex flex-col gap-2 rounded-md border p-4 transition-colors hover:border-foreground/30 ${
                  isAccepted
                    ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10"
                    : "border-border bg-card"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{p.summary}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      isAccepted
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : p.status === "active"
                          ? "border-amber-300 bg-amber-50 text-amber-900"
                          : "border-border"
                    }`}
                  >
                    {p.status}
                  </span>
                  <span className="text-emerald-700">▲ {p.voteCountYes} yes</span>
                  <span className="text-red-700">▼ {p.voteCountNo} no</span>
                  <span>{p.license}</span>
                  <span className="ml-auto">{formatRelative(p.createdAt)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
