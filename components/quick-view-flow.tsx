"use client";

import { useEffect, useRef, useState } from "react";

import type { PipelineStage, PipelineState } from "@/lib/problems/pipeline-state";

interface QuickViewFlowProps {
  state: PipelineState;
  problemTitle: string;
}

/**
 * Floating bottom-right button on the problem hub. On hover (or focus) it
 * reveals a popup that renders the 9-stage workflow ribbon from
 * BRIEF/02-STRUCTURE.md with the current state of this problem highlighted.
 *
 * Visual treatment: clean Tailwind for the button (matches the rest of the
 * page), warm-paper TINT inside the popup (a small nod to the BRIEF
 * aesthetic without breaking the page's daily-use legibility).
 */
export function QuickViewFlow({ state, problemTitle }: QuickViewFlowProps) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tiny grace period so the popup doesn't dismiss mid-mouse-travel between
  // the button and the popup card.
  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }
  function scheduleHide() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-40 print:hidden">
      {open && (
        <div
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          role="dialog"
          aria-label={`Workflow status for ${problemTitle}`}
          className="mb-3 w-[320px] origin-bottom-right rounded-md border border-amber-200/70 bg-[#fbf6ec] text-stone-900 shadow-lg ring-1 ring-stone-900/5 dark:bg-[#2a261f] dark:text-stone-100 dark:border-amber-900/40"
        >
          <PopupBody state={state} problemTitle={problemTitle} />
        </div>
      )}
      <button
        type="button"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        aria-label="Quick view: workflow status"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted"
      >
        <span aria-hidden className="inline-block size-2 rounded-full bg-amber-500" />
        <span>Flow</span>
      </button>
    </div>
  );
}

function PopupBody({ state, problemTitle }: QuickViewFlowProps) {
  return (
    <div className="p-4 space-y-3">
      <div className="space-y-0.5 border-b border-amber-200/40 dark:border-amber-900/30 pb-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Workflow
        </p>
        <p className="text-sm font-serif italic leading-snug line-clamp-2" title={problemTitle}>
          {problemTitle}
        </p>
      </div>

      <ol className="space-y-1.5">
        {state.stages.map((stage) => (
          <PipelineRow key={stage.key} stage={stage} />
        ))}
      </ol>

      <div className="border-t border-amber-200/40 dark:border-amber-900/30 pt-2 text-[11px] font-mono uppercase tracking-wider text-stone-600 dark:text-stone-400">
        {state.council.label}
      </div>
    </div>
  );
}

function PipelineRow({ stage }: { stage: PipelineStage }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <StatusDot status={stage.status} />
      <span
        className={`font-mono text-[11px] uppercase tracking-[0.08em] ${
          stage.status === "done"
            ? "text-stone-700 dark:text-stone-300"
            : stage.status === "active"
              ? "text-stone-900 dark:text-stone-100 font-semibold"
              : "text-stone-400 dark:text-stone-500"
        }`}
      >
        {stage.label}
      </span>
      {stage.detail && (
        <span className="ml-auto text-[11px] font-serif italic text-stone-500 dark:text-stone-400">
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
