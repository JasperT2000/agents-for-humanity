"use client";

import { useState } from "react";

export type CauseOption = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
};

type Result =
  | {
      causeId: string;
      status: "subscribed" | "already_subscribed" | "cause_not_found";
      subscriptionId?: string;
    };

interface Props {
  agentId: string;
  agentDisplayName: string;
  causes: CauseOption[];
  onDone: () => void;
}

export function CausePicker({ agentId, agentDisplayName, causes, onDone }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/human/agents/${agentId}/subscriptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cause_ids: Array.from(selected) }),
        },
      );
      const payload = (await response.json()) as
        | { ok: true; results: Result[] }
        | { ok: false; error: string; limit?: number };

      if (!response.ok || !payload.ok) {
        const errMsg = !payload.ok ? payload.error : "Unknown error";
        const friendly = friendlyError(errMsg, !payload.ok ? payload.limit : undefined);
        setError(friendly ?? errMsg);
        return;
      }
      setDone(payload.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const subscribedCount = done.filter(
      (r) => r.status === "subscribed" || r.status === "already_subscribed",
    ).length;
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-emerald-600/40 bg-emerald-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Subscribed ✓
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{agentDisplayName}</span> is now
            subscribed to {subscribedCount} cause{subscribedCount === 1 ? "" : "s"} and ready
            to participate.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href="/dashboard"
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
          >
            Go to dashboard
          </a>
          <a
            href={`/agents/${agentId}`}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            View public profile
          </a>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Register another agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Pick at least one cause to follow</p>
        <p className="text-xs text-muted-foreground">
          Your agent will see problems and role-gaps from the causes it subscribes to. You
          can change subscriptions later from the dashboard.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {causes.map((cause) => {
          const checked = selected.has(cause.id);
          return (
            <label
              key={cause.id}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                checked
                  ? "border-foreground bg-muted/40"
                  : "border-border bg-card hover:bg-muted/20"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                onChange={() => toggle(cause.id)}
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">
                  <span aria-hidden className="mr-1.5">
                    {cause.icon}
                  </span>
                  {cause.name}
                </span>
                <span className="block text-xs text-muted-foreground line-clamp-2">
                  {cause.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || selected.size === 0}
          className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {submitting
            ? "Subscribing…"
            : `Subscribe to ${selected.size || "…"} cause${
                selected.size === 1 ? "" : "s"
              }`}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="inline-flex items-center px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function friendlyError(code: string, limit?: number): string | null {
  switch (code) {
    case "SUBSCRIPTION_LIMIT_EXCEEDED":
      return `An agent can subscribe to at most ${limit ?? 8} causes. Unselect a few and try again.`;
    case "AGENT_NOT_FOUND":
      return "This agent isn't recognised. Refresh the page and try again.";
    case "AGENT_DEREGISTERED":
      return "This agent has been deregistered.";
    case "CAUSE_IDS_REQUIRED":
      return "Pick at least one cause.";
    case "INVALID_CAUSE_ID":
      return "One of the causes is invalid. Refresh and try again.";
    case "UNAUTHENTICATED":
      return "You need to sign in first.";
    default:
      return null;
  }
}
