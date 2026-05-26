"use client";

import { useEffect, useRef, useState } from "react";

import type { PipelineStage, PipelineState } from "@/lib/problems/pipeline-state";

interface QuickViewFlowProps {
  state: PipelineState;
  problemTitle: string;
}

/**
 * Floating bottom-right "Quick view" button on the problem hub. On hover (or
 * focus) it reveals a popup that renders the 9-stage workflow ribbon from
 * BRIEF/02-STRUCTURE.md as literally as a daily-UI popup allows:
 *
 *   "Hand-drawn curly braces span the vertical regions where each workflow
 *    stage's content lives... Each brace label is in monospace small-caps in
 *    the role's ink color. The braces are organic, slightly imperfect."
 *
 * We render each brace as an SVG path with a tiny per-stage angle jitter to
 * carry the "organic, slightly imperfect" feel without going so far that the
 * rest of the daily-use page feels off-tone.
 *
 * Hover handling lives on the OUTER container so the cursor travelling between
 * the button and the popup never leaves the hover target — no flicker.
 */
export function QuickViewFlow({ state, problemTitle }: QuickViewFlowProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNow() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <div
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={scheduleClose}
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end print:hidden"
    >
      {open && <PopupCard state={state} problemTitle={problemTitle} />}
      <button
        type="button"
        aria-label="Quick view: workflow status"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted"
      >
        <span aria-hidden className="inline-block size-2 rounded-full bg-amber-500" />
        <span>Quick view</span>
      </button>
    </div>
  );
}

function PopupCard({ state, problemTitle }: QuickViewFlowProps) {
  return (
    <div
      role="dialog"
      aria-label={`Workflow status for ${problemTitle}`}
      className="mb-2 w-[460px] max-w-[calc(100vw-3rem)] origin-bottom-right rounded-md border border-amber-200/70 bg-[#fbf6ec] text-stone-900 shadow-xl ring-1 ring-stone-900/5 dark:bg-[#2a261f] dark:text-stone-100 dark:border-amber-900/40"
    >
      <div className="p-5 space-y-4">
        <div className="space-y-0.5 border-b border-amber-200/50 dark:border-amber-900/30 pb-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            Workflow ribbon
          </p>
          <p className="text-base font-serif italic leading-snug line-clamp-2" title={problemTitle}>
            {problemTitle}
          </p>
        </div>

        <ol className="space-y-0">
          {state.stages.map((stage, idx) => (
            <PipelineRow key={stage.key} stage={stage} index={idx} />
          ))}
        </ol>

        <div className="border-t border-amber-200/50 dark:border-amber-900/30 pt-3 text-[11px] font-mono uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400">
          {state.council.label}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-stage ink color per BRIEF/02-STRUCTURE.md ("research = brown,
 * critique = orange, steelman = teal, verify = amber, synth = green").
 * Stages without an explicit color use neutral stone.
 */
const STAGE_INK: Record<PipelineStage["key"], string> = {
  problem: "text-stone-700 dark:text-stone-300",
  subProblems: "text-stone-700 dark:text-stone-300",
  research: "text-amber-800 dark:text-amber-300",
  proposals: "text-stone-700 dark:text-stone-300",
  critique: "text-orange-700 dark:text-orange-400",
  steelman: "text-teal-700 dark:text-teal-300",
  verify: "text-amber-600 dark:text-amber-200",
  synth: "text-emerald-700 dark:text-emerald-400",
  convergence: "text-stone-800 dark:text-stone-200",
};

/**
 * Deterministic per-row angle jitter so each brace looks slightly imperfect
 * without thrashing between renders. Range ~[-4deg, +4deg].
 */
const BRACE_JITTERS = [-3.2, 1.8, -2.4, 2.7, -3.6, 1.2, -1.6, 2.4, -2.8];

function PipelineRow({ stage, index }: { stage: PipelineStage; index: number }) {
  const ink = STAGE_INK[stage.key];
  const dim = stage.status === "pending";
  const emphasised = stage.status === "active";
  const jitter = BRACE_JITTERS[index % BRACE_JITTERS.length];
  return (
    <li className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 py-1.5">
      <CurlyBrace dim={dim} jitterDeg={jitter} />
      <StatusDot status={stage.status} />
      <span
        className={`font-mono text-xs uppercase tracking-[0.12em] ${ink} ${
          dim ? "opacity-40" : emphasised ? "font-bold" : "font-semibold"
        }`}
      >
        {stage.label}
      </span>
      {stage.detail ? (
        <span
          className={`text-[11px] font-serif italic justify-self-end ${
            dim ? "text-stone-400 dark:text-stone-500" : "text-stone-600 dark:text-stone-400"
          }`}
        >
          {stage.detail}
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

/**
 * Hand-drawn-feeling curly brace, rendered as SVG so it can carry small
 * organic asymmetries that a single `{` character can't. Each instance
 * gets a small angle jitter per-row to read as "drawn, not typeset".
 */
function CurlyBrace({ dim = false, jitterDeg = 0 }: { dim?: boolean; jitterDeg?: number }) {
  const cls = dim
    ? "text-stone-300 dark:text-stone-600"
    : "text-stone-500 dark:text-stone-400";
  return (
    <svg
      aria-hidden
      width="14"
      height="34"
      viewBox="0 0 14 34"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${cls} shrink-0`}
      style={{ transform: `rotate(${jitterDeg}deg)` }}
    >
      {/*
        Path drawn so it's deliberately not symmetric — the top curl is
        slightly longer than the bottom, the inflection isn't exactly at
        mid-height, and the inner point sits a hair left of centre. That
        asymmetry is what makes it read as hand-drawn rather than typeset.
      */}
      <path d="M 11 1.5 C 6.5 2.6, 6.2 7, 6.4 11.2 C 6.5 14, 5.6 15.6, 2.4 16.6 C 5.6 17.4, 6.6 19.1, 6.5 22 C 6.4 26.4, 6.9 30.6, 11 32.4" />
    </svg>
  );
}

function StatusDot({ status }: { status: PipelineStage["status"] }) {
  const cls =
    status === "done"
      ? "bg-emerald-700"
      : status === "active"
        ? "bg-amber-500 ring-2 ring-amber-300/60"
        : "bg-stone-300 dark:bg-stone-600";
  return <span aria-hidden className={`inline-block size-2.5 rounded-full shrink-0 ${cls}`} />;
}
