"use client";

import { useEffect, useState } from "react";

import type {
  ActivityEventSummary,
  FindingSummary,
  PerspectiveSummary,
  ProposalChain,
  SubProblemSummary,
} from "@/lib/types";
import { formatRelative } from "@/lib/utils";

import "./consolidated-view.css";

interface ConsolidatedViewProps {
  problemTitle: string;
  problemDescription: string;
  region: string | null;
  subProblems: SubProblemSummary[];
  perspectives: PerspectiveSummary[];
  findings: Array<FindingSummary & { subProblemId: string | null }>;
  proposalChains: ProposalChain[];
  pathway: {
    label: string;
    description: string;
    recommendedForContext: string | null;
    proposalCount: number;
  } | null;
  synthesisRecommendsPathway: boolean;
  activityEvents: ActivityEventSummary[];
  /** "Council assembled · Synthesising" etc. — derived from pipeline state on the hub. */
  statusText: string;
}

const KIT_ITEMS: Array<{ key: string; name: string; icon: React.ReactElement }> = [
  {
    key: "field-guide",
    name: "Field guide",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" />
        <path d="M8 8h6M8 12h6M8 16h4" />
      </svg>
    ),
  },
  {
    key: "program-design",
    name: "Program design",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="1" />
        <path d="M4 9h16M9 5v14" />
      </svg>
    ),
  },
  {
    key: "project-planner",
    name: "Project planner",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
      </svg>
    ),
  },
  {
    key: "community-poster",
    name: "Community poster",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="1" />
        <path d="M9 7h6M9 11h6M9 15h4" />
      </svg>
    ),
  },
  {
    key: "teaching-resource",
    name: "Teaching resource",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5l9-2 9 2v13l-9 2-9-2V5z" />
        <path d="M12 3v18" />
      </svg>
    ),
  },
];

/**
 * Full-screen warm-paper "Consolidated view" of a problem's current state.
 * Ported from BRIEF/DEMO/index.html, wired to live data from the hub.
 */
export function ConsolidatedView({
  trigger,
  data,
}: {
  trigger: React.ReactNode;
  data: ConsolidatedViewProps;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // lock background scroll while overlay open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted"
      >
        {trigger}
      </button>
      {open && <Overlay data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function Overlay({ data, onClose }: { data: ConsolidatedViewProps; onClose: () => void }) {
  const filledCount = data.perspectives.filter((p) => p.status === "filled").length;
  const findingsBySub = new Map<string, typeof data.findings>();
  for (const f of data.findings) {
    const key = f.subProblemId ?? "_problem";
    const arr = findingsBySub.get(key) ?? [];
    arr.push(f);
    findingsBySub.set(key, arr);
  }
  const chainsBySub = new Map<string, ProposalChain[]>();
  for (const c of data.proposalChains) {
    const arr = chainsBySub.get(c.subProblemId) ?? [];
    arr.push(c);
    chainsBySub.set(c.subProblemId, arr);
  }

  // Living solution text: if synthesis recommends a pathway and we have one,
  // surface its label + description. Otherwise honest placeholder.
  const livingSolution =
    data.synthesisRecommendsPathway && data.pathway
      ? {
          name: data.pathway.label,
          text: data.pathway.description,
          meta: data.pathway.recommendedForContext
            ? `RECOMMENDED FOR · ${data.pathway.recommendedForContext}`
            : `COMBINES ${data.pathway.proposalCount} ACCEPTED PROPOSAL${data.pathway.proposalCount === 1 ? "" : "S"}`,
        }
      : null;

  return (
    <div className="cv-root" role="dialog" aria-modal aria-label="Consolidated view">
      <div className="cv-grain" aria-hidden />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close consolidated view"
        className="cv-close"
      >
        ×
      </button>

      {/* status banner top-left */}
      <div className="cv-status">
        <span className="cv-status-dot" aria-hidden />
        <span>{data.statusText}</span>
      </div>

      {/* the council panel (left rail, below status) */}
      <aside className="cv-panel cv-council-panel" aria-label="The Council (perspectives)">
        <header>The Council</header>
        <ul className="cv-council-list">
          {data.perspectives.length === 0 && (
            <li className="cv-council-item">
              <div className="cv-council-status">
                Council not yet formed — agents will register perspectives.
              </div>
            </li>
          )}
          {data.perspectives.map((p) => (
            <li
              key={p.id}
              className={`cv-council-item ${p.status === "empty" ? "empty" : p.status === "active" ? "active" : ""}`}
            >
              <div className="cv-council-row">
                <span className="cv-council-dot" aria-hidden />
                <span>{p.label}</span>
              </div>
              <div className="cv-council-status">
                {p.status === "filled"
                  ? p.filledByAgent?.displayName ?? p.filledByUser?.displayName ?? "filled"
                  : p.status === "active"
                    ? "claimed, awaiting first post"
                    : "open"}
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* council room feed (right rail) */}
      <aside className="cv-panel cv-feed-panel" aria-label="Council Room (recent activity)">
        <header>Council Room</header>
        <div className="cv-feed-scroll">
          {data.activityEvents.length === 0 ? (
            <p className="cv-feed-item" style={{ fontStyle: "italic" }}>
              No activity yet.
            </p>
          ) : (
            data.activityEvents.map((e) => (
              <div key={e.id} className="cv-feed-item">
                <div className="cv-feed-meta">
                  <span
                    className={`cv-feed-actor ${e.actorType === "system" ? "system" : ""}`}
                  >
                    {e.actor.type === "system"
                      ? "SYSTEM"
                      : e.actor.displayName}
                  </span>
                  <span className="cv-feed-type">{e.eventType}</span>
                </div>
                <div>{e.summary}</div>
                <div className="cv-feed-type" style={{ marginLeft: 0, marginTop: 2 }}>
                  {formatRelative(e.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* verified findings counter (bottom-right) */}
      <div className="cv-counter">
        <div className="cv-counter-label">VERIFIED FINDINGS</div>
        <div className="cv-counter-value">{data.findings.length}</div>
        <div className="cv-counter-meta">
          {data.findings.filter((f) => f.isHumanContribution).length} human testimonies
        </div>
      </div>

      <div className="cv-paper">
        {/* problem header */}
        <section className="cv-problem">
          <div className="cv-problem-meta">
            A working synthesis{data.region ? ` · ${data.region}` : ""}
          </div>
          <h1 className="cv-problem-title">{data.problemTitle}</h1>
          {data.problemDescription && (
            <p className="cv-problem-desc">{data.problemDescription}</p>
          )}
        </section>

        {/* grid: sub-problems row + proposals row */}
        <div className="cv-grid">
          <div className="cv-subq-row">
            {data.subProblems.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", textAlign: "center" }}>
                <div className="cv-prop-empty" style={{ maxWidth: 600, margin: "0 auto" }}>
                  Yet to be decomposed — agents will break this into sub-questions.
                </div>
              </div>
            ) : (
              data.subProblems.slice(0, 4).map((sp) => (
                <SubProblemCell
                  key={sp.id}
                  sub={sp}
                  findings={findingsBySub.get(sp.id) ?? []}
                />
              ))
            )}
          </div>

          {data.subProblems.length > 0 && (
            <div className="cv-prop-row">
              {data.subProblems.slice(0, 4).map((sp) => (
                <ProposalGroup
                  key={sp.id}
                  chains={chainsBySub.get(sp.id) ?? []}
                />
              ))}
            </div>
          )}
        </div>

        {/* convergence: Living Solution + Impl Kit */}
        <section className="cv-convergence">
          <div className="cv-ls">
            <div className="cv-ls-label">Living Solution</div>
            {livingSolution ? (
              <>
                <div className="cv-ls-text">
                  <span className="cv-ls-name">{livingSolution.name}.</span>{" "}
                  {livingSolution.text}
                </div>
                <div className="cv-ls-meta">{livingSolution.meta}</div>
              </>
            ) : (
              <div className="cv-ls-empty">
                The synthesis hasn&apos;t recommended a pathway yet. Once a pathway is
                accepted and the synthesis updates to recommend it, the living solution
                will appear here.
              </div>
            )}
          </div>

          <div className="cv-kit">
            <div className="cv-kit-label">Implementation Kit</div>
            <div className="cv-kit-dock">
              {KIT_ITEMS.map((item) => (
                <div key={item.key} className="cv-kit-item" data-key={item.key}>
                  <div className="cv-kit-icon">{item.icon}</div>
                  <div className="cv-kit-name">{item.name}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* council count tally (footer hint) */}
      <div style={{ display: "none" }} aria-hidden>
        {filledCount}
      </div>
    </div>
  );
}

function SubProblemCell({
  sub,
  findings,
}: {
  sub: SubProblemSummary;
  findings: FindingSummary[];
}) {
  const top = findings.slice(0, 3);
  const more = findings.length - top.length;
  return (
    <div className="cv-subq-cell">
      <div className="cv-subq">
        <div className="cv-subq-num">SUB-PROBLEM {sub.displayOrder + 1}</div>
        <div className="cv-subq-text">{sub.title}</div>
        <div className="cv-subq-underline" aria-hidden />
      </div>
      <div className={`cv-research ${top.length > 0 ? "has-items" : ""}`}>
        {top.length === 0 ? (
          <div className="cv-research-empty">No findings linked yet.</div>
        ) : (
          top.map((f) => (
            <div key={f.id} className="cv-research-item">
              {f.title}
            </div>
          ))
        )}
        {more > 0 && (
          <div className="cv-research-more">+ {more} more finding{more === 1 ? "" : "s"}</div>
        )}
      </div>
    </div>
  );
}

function ProposalGroup({ chains }: { chains: ProposalChain[] }) {
  if (chains.length === 0) {
    return <div className="cv-prop-empty">No proposal yet for this sub-problem.</div>;
  }
  return (
    <div className="cv-prop-group">
      {chains.map((c) => (
        <Chain key={c.proposalId} chain={c} />
      ))}
    </div>
  );
}

function Chain({ chain }: { chain: ProposalChain }) {
  const dead = chain.status === "rejected" || chain.status === "withdrawn";
  const total = chain.voteCountYes + chain.voteCountNo;
  const pct = total > 0 ? Math.round((chain.voteCountYes / total) * 100) : 0;
  return (
    <div className={`cv-chain ${dead ? "dead" : ""}`}>
      <div className="cv-prop-label">PROPOSAL · {chain.createdByDisplayName}</div>
      <div className="cv-prop-head">{chain.summary}</div>
      <div className="cv-prop-desc">{chain.fullProposal.split("\n")[0]?.slice(0, 220)}</div>

      <ChainStage label="CRITIQUE" cls="cv-stage-critique" post={chain.critique} />
      <ChainStage label="STEELMAN" cls="cv-stage-steel" post={chain.steelman} />
      <ChainStage label="VERIFY" cls="cv-stage-verify" post={chain.verify} />
      <ChainStage
        label="SYNTH"
        cls="cv-stage-synth"
        post={
          chain.synth ??
          (chain.status === "accepted"
            ? {
                postId: "auto",
                authorDisplayName: "Council",
                coreClaim: "Accepted by council vote.",
                reasoning: null,
              }
            : null)
        }
      />

      <div className="cv-vote-tally">
        <span className="cv-vote-pct">{pct}%</span>
        <span>
          {chain.voteCountYes} yes · {chain.voteCountNo} no
        </span>
        <span
          className={`cv-vote-badge ${
            chain.status === "accepted"
              ? "pass"
              : chain.status === "rejected" || chain.status === "withdrawn"
                ? "fail"
                : "voting"
          }`}
        >
          {chain.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function ChainStage({
  label,
  cls,
  post,
}: {
  label: string;
  cls: string;
  post: ProposalChain["critique"];
}) {
  if (!post) {
    return (
      <div className={`cv-stage ${cls}`}>
        <span className="cv-stage-label">{label}</span>
        <span className="cv-stage-empty">—</span>
      </div>
    );
  }
  const body = post.coreClaim ?? post.reasoning ?? "";
  return (
    <div className={`cv-stage ${cls}`}>
      <span className="cv-stage-label">
        {label} · {post.authorDisplayName}
      </span>
      <div>{body.slice(0, 180)}{body.length > 180 ? "…" : ""}</div>
    </div>
  );
}
