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
 * BRIEF/02-STRUCTURE.md literally — hand-drawn-style curly braces with each
 * stage label in its role's ink color (brown / orange / teal / amber / green).
 *
 * Hover handling lives on the OUTER container so the cursor travelling between
 * the button and the popup never leaves the hover target — eliminates the
 * flicker the prior version exhibited.
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
      // No top margin — sit flush against the button so the cursor's path
      // between popup and button never leaves the container.
      className="mb-2 w-[340px] origin-bottom-right rounded-md border border-amber-200/70 bg-[#fbf6ec] text-stone-900 shadow-xl ring-1 ring-stone-900/5 dark:bg-[#2a261f] dark:text-stone-100 dark:border-amber-900/40"
    >
      <div className="p-4 space-y-3">
        <div className="space-y-0.5 border-b border-amber-200/40 dark:border-amber-900/30 pb-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Workflow ribbon
          </p>
          <p className="text-sm font-serif italic leading-snug line-clamp-2" title={problemTitle}>
            {problemTitle}
          </p>
        </div>

        <ol className="relative space-y-1.5 pl-3">
          {state.stages.map((stage) => (
            <PipelineRow key={stage.key} stage={stage} />
          ))}
        </ol>

        <div className="border-t border-amber-200/40 dark:border-amber-900/30 pt-2 text-[11px] font-mono uppercase tracking-wider text-stone-600 dark:text-stone-400">
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

function PipelineRow({ stage }: { stage: PipelineStage }) {
  const ink = STAGE_INK[stage.key];
  const dim = stage.status === "pending";
  const emphasised = stage.status === "active";
  return (
    <li className="flex items-baseline gap-2 text-sm">
      {/* Curly brace in monospace, BRIEF-style "{" prefix. Subtle skew gives
          it a touch of the "organic, slightly imperfect" feel the brief asks
          for without going full hand-drawn. */}
      <span
        aria-hidden
        className={`font-mono font-bold leading-none translate-y-[1px] ${
          dim ? "text-stone-300 dark:text-stone-600" : "text-stone-500 dark:text-stone-400"
        }`}
        style={{ transform: "skewY(-6deg)" }}
      >
        {"{"}
      </span>
      <StatusDot status={stage.status} />
      <span
        className={`font-mono text-[11px] uppercase tracking-[0.1em] ${ink} ${
          dim ? "opacity-40" : emphasised ? "font-bold" : "font-semibold"
        }`}
      >
        {stage.label}
      </span>
      {stage.detail && (
        <span
          className={`ml-auto text-[11px] font-serif italic ${
            dim ? "text-stone-400 dark:text-stone-500" : "text-stone-600 dark:text-stone-400"
          }`}
        >
          {stage.detail}
        </span>
      )}
    </li>
  );
}

function StatusDot({ status }: { status: PipelineStage["status"] }) {
  const cls =
    status === "done"
      ? "bg-emerald-700"
      : status === "active"
        ? "bg-amber-500 ring-2 ring-amber-300/60"
        : "bg-stone-300 dark:bg-stone-600";
  return <span aria-hidden className={`inline-block size-2 rounded-full shrink-0 ${cls}`} />;
}
