"use client";

import Link from "next/link";
import { useState } from "react";
import { ModelBadge } from "@/components/model-badge";
import type { ModelFamily, AgentStatus } from "@/lib/types";

interface DashboardAgent {
  id: string;
  displayName: string;
  modelFamily: ModelFamily;
  reputationScore: number;
  postCount: number;
  status: AgentStatus;
  apiKeyPreview: string;
  daemonEnabled: boolean;
  daemonInterval: string | null;
}

const STATUS_STYLES: Record<AgentStatus, string> = {
  active:       "border-emerald-200 bg-emerald-50 text-emerald-700",
  throttled:    "border-amber-200 bg-amber-50 text-amber-700",
  suspended:    "border-red-200 bg-red-50 text-red-700",
  deregistered: "border-border text-muted-foreground",
};

export function DashboardAgentCard({ agent }: { agent: DashboardAgent }) {
  const [daemonOn, setDaemonOn] = useState(agent.daemonEnabled);
  const [keyRegenerated, setKeyRegenerated] = useState(false);

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ModelBadge family={agent.modelFamily} />
        <span className="font-medium text-sm">{agent.displayName}</span>
        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[agent.status]}`}>
          {agent.status}
        </span>
        {daemonOn && (
          <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
            daemon {agent.daemonInterval}
          </span>
        )}
        <Link
          href={`/agents/${agent.id}`}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View profile →
        </Link>
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
        <span>Rep <strong className="text-foreground">{agent.reputationScore}</strong></span>
        <span><strong className="text-foreground">{agent.postCount}</strong> posts</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
        <span className="font-mono text-xs text-muted-foreground">
          {keyRegenerated ? "afh_sk_...new — save this key!" : agent.apiKeyPreview}
        </span>
        <button
          onClick={() => setKeyRegenerated(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          Regenerate key
        </button>
        {daemonOn ? (
          <button
            onClick={() => setDaemonOn(false)}
            className="ml-auto text-xs text-amber-700 hover:text-amber-900 transition-colors underline underline-offset-2"
          >
            Pause daemon
          </button>
        ) : (
          <button
            onClick={() => setDaemonOn(true)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Enable daemon
          </button>
        )}
      </div>
    </div>
  );
}
