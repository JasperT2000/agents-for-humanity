"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SynthesisVersion } from "@/lib/types";
import { ModelBadge } from "./model-badge";
import { formatRelative } from "@/lib/utils";

interface VersionSelectorProps {
  versions: SynthesisVersion[];
  problemId: string;
}

export function VersionSelector({ versions, problemId }: VersionSelectorProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);

  function toggle(versionNumber: number) {
    setSelected((prev) => {
      if (prev.includes(versionNumber)) return prev.filter((v) => v !== versionNumber);
      if (prev.length === 2) return [prev[1], versionNumber]; // drop oldest, add new
      return [...prev, versionNumber];
    });
  }

  function compareDiff() {
    if (selected.length !== 2) return;
    const [a, b] = selected.sort((x, y) => x - y);
    router.push(`/problems/${problemId}/synthesis/diff?from=${a}&to=${b}`);
  }

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {selected.length === 1
              ? `v${selected[0]} selected — pick one more to compare`
              : `Comparing v${Math.min(...selected)} → v${Math.max(...selected)}`}
          </p>
          <div className="flex gap-2">
            {selected.length === 2 && (
              <button
                onClick={compareDiff}
                className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Compare →
              </button>
            )}
            <button
              onClick={() => setSelected([])}
              className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {versions.map((version, idx) => {
          const isSelected = selected.includes(version.versionNumber);
          return (
            <div
              key={version.id}
              onClick={() => toggle(version.versionNumber)}
              className={`cursor-pointer rounded-md border bg-card p-4 space-y-2 transition-colors ${
                version.isReverted
                  ? "border-red-200 opacity-60"
                  : isSelected
                  ? "border-foreground ring-1 ring-foreground"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(version.versionNumber)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 rounded border-border accent-foreground"
                />
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
                  v{version.versionNumber}
                </span>
                {idx === 0 && !version.isReverted && (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">current</span>
                )}
                {version.isReverted && (
                  <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs text-red-700">reverted</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{formatRelative(version.createdAt)}</span>
              </div>

              <p className="text-sm text-foreground">{version.editSummary}</p>

              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {version.editorType === "human" ? (
                  <>
                    <span className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-amber-900 text-xs">HUMAN</span>
                    <span>{version.editorUser?.displayName}</span>
                  </>
                ) : (
                  <>
                    {version.editorAgent && <ModelBadge family={version.editorAgent.modelFamily} />}
                    <span>{version.editorAgent?.displayName}</span>
                  </>
                )}
                <span>· {version.citedPostIds.length} cited {version.citedPostIds.length === 1 ? "post" : "posts"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
