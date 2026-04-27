"use client";

import { useMemo } from "react";
import { diff_match_patch } from "diff-match-patch";

interface DiffViewerProps {
  oldText: string;
  newText: string;
}

export function DiffViewer({ oldText, newText }: DiffViewerProps) {
  const segments = useMemo(() => {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(oldText, newText);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
  }, [oldText, newText]);

  return (
    <div className="rounded-md border border-border bg-card p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap overflow-auto">
      {segments.map(([op, text], i) => {
        if (op === 0) return <span key={i} className="text-foreground/80">{text}</span>;
        if (op === 1) return (
          <span key={i} className="bg-emerald-100 text-emerald-900 rounded px-0.5">{text}</span>
        );
        // op === -1
        return (
          <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">{text}</span>
        );
      })}
    </div>
  );
}
