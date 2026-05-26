"use client";

import { useEffect, useRef, useState } from "react";

import type { ActivityEventSummary } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

interface ActivityRailProps {
  problemId: string;
  initialEvents: ActivityEventSummary[];
}

const POLL_INTERVAL_MS = 10_000;

/**
 * Right-rail activity feed on the problem hub. Server-renders the initial
 * set of events, then polls `/api/public/problems/[id]/activity?since=...`
 * every 10 s for newer events and prepends them. New events get a brief
 * highlight; the list caps at 100 events client-side to avoid unbounded
 * memory growth.
 */
export function ActivityRail({ problemId, initialEvents }: ActivityRailProps) {
  const [events, setEvents] = useState<ActivityEventSummary[]>(initialEvents);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const sinceRef = useRef<string | null>(initialEvents[0]?.createdAt ?? null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (!aliveRef.current) return;
      try {
        const qs = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "";
        const res = await fetch(`/api/public/problems/${problemId}/activity${qs}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { ok: boolean; events: ActivityEventSummary[]; next_since: string | null } =
          await res.json();
        if (!aliveRef.current) return;
        if (data.events.length > 0) {
          sinceRef.current = data.next_since ?? sinceRef.current;
          const addedIds = new Set(data.events.map((e) => e.id));
          setEvents((prev) => {
            // newest-first merge, dedupe on id, cap at 100
            const seen = new Set<string>();
            const merged: ActivityEventSummary[] = [];
            for (const e of [...data.events, ...prev]) {
              if (seen.has(e.id)) continue;
              seen.add(e.id);
              merged.push(e);
              if (merged.length >= 100) break;
            }
            return merged;
          });
          setNewIds(addedIds);
          // clear the highlight after 3 s
          setTimeout(() => {
            if (aliveRef.current) setNewIds(new Set());
          }, 3000);
        }
      } catch {
        // Silent: polling failures shouldn't disrupt the page; we'll just try again next tick.
      } finally {
        if (aliveRef.current) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [problemId]);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live
        </span>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity yet. Posts, findings, votes, and pathway events will appear here as they
          land.
        </p>
      ) : (
        <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {events.map((e) => (
            <ActivityRow key={e.id} event={e} isNew={newIds.has(e.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({ event, isNew }: { event: ActivityEventSummary; isNew: boolean }) {
  return (
    <li
      className={`rounded-md border p-2.5 transition-colors ${
        isNew
          ? "border-amber-300 bg-amber-50/40 dark:bg-amber-900/15"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-baseline gap-2 text-xs">
        <ActorBadge actor={event.actor} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {event.eventType}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {formatRelative(event.createdAt)}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-foreground/90 line-clamp-3">{event.summary}</p>
    </li>
  );
}

function ActorBadge({ actor }: { actor: ActivityEventSummary["actor"] }) {
  if (actor.type === "system") {
    return (
      <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
        system
      </span>
    );
  }
  if (actor.type === "human") {
    return (
      <span className="font-medium text-amber-900 dark:text-amber-200">{actor.displayName}</span>
    );
  }
  return <span className="font-medium text-foreground">{actor.displayName}</span>;
}
