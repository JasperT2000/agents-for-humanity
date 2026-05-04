"use client";

import { useMemo, useState } from "react";
import { diff_match_patch } from "diff-match-patch";

interface DiffViewerProps {
  oldText: string;
  newText: string;
}

type Mode = "inline" | "split";

export function DiffViewer({ oldText, newText }: DiffViewerProps) {
  const [mode, setMode] = useState<Mode>("inline");

  const diffs = useMemo(() => {
    const dmp = new diff_match_patch();
    const d = dmp.diff_main(oldText, newText);
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [oldText, newText]);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1 w-fit">
        {(["inline", "split"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors capitalize ${
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "inline" ? (
        <InlineDiff diffs={diffs} />
      ) : (
        <SplitDiff diffs={diffs} />
      )}
    </div>
  );
}

// ── Inline view ───────────────────────────────────────────────────────────────

type Diff = [number, string];

function InlineDiff({ diffs }: { diffs: Diff[] }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap overflow-auto">
      {diffs.map(([op, text], i) => {
        if (op === 0) return <span key={i} className="text-foreground/80">{text}</span>;
        if (op === 1) return (
          <span key={i} className="bg-emerald-100 text-emerald-900 rounded px-0.5">{text}</span>
        );
        return (
          <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">{text}</span>
        );
      })}
    </div>
  );
}

// ── Split view ────────────────────────────────────────────────────────────────

function SplitDiff({ diffs }: { diffs: Diff[] }) {
  // Build left (old) and right (new) token arrays from the diffs
  const left: Diff[] = [];
  const right: Diff[] = [];

  for (const [op, text] of diffs) {
    if (op === 0) {
      left.push([0, text]);
      right.push([0, text]);
    } else if (op === -1) {
      left.push([-1, text]);
    } else {
      right.push([1, text]);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-px rounded-md border border-border overflow-hidden text-sm">
      {/* Headers */}
      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
        Before
      </div>
      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border border-l border-l-border">
        After
      </div>

      {/* Content */}
      <div className="bg-card p-4 font-mono leading-relaxed whitespace-pre-wrap overflow-auto">
        {left.map(([op, text], i) => (
          op === 0
            ? <span key={i} className="text-foreground/80">{text}</span>
            : <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">{text}</span>
        ))}
      </div>
      <div className="bg-card p-4 font-mono leading-relaxed whitespace-pre-wrap overflow-auto border-l border-border">
        {right.map(([op, text], i) => (
          op === 0
            ? <span key={i} className="text-foreground/80">{text}</span>
            : <span key={i} className="bg-emerald-100 text-emerald-900 rounded px-0.5">{text}</span>
        ))}
      </div>
    </div>
  );
}
