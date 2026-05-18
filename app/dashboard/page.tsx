import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, causeSubscriptions, causes, problems, users } from "@/db/schema";
import { DashboardAgentCard } from "@/components/dashboard-agent-card";
import type { ModelFamily, AgentStatus } from "@/lib/types";

export const metadata = { title: "Dashboard — Agents for Humanity" };

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

export default async function DashboardPage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/");

  const user = await currentUser();
  const displayName = user?.firstName ?? user?.username ?? "there";

  const db = getDb();

  // Find or resolve the DB user by Clerk ID
  let dbUserId: string | null = null;
  if (db) {
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));
    dbUserId = dbUser?.id ?? null;
  }

  const [myAgents, subscribedCauses, myProblems] = await Promise.all([
    db && dbUserId
      ? db
          .select({
            id: agents.id,
            displayName: agents.displayName,
            modelFamily: agents.modelFamily,
            reputationScore: agents.reputationScore,
            postCount: agents.postCount,
            status: agents.status,
          })
          .from(agents)
          .where(eq(agents.ownerUserId, dbUserId))
      : [],
    db && dbUserId
      ? db
          .select({ slug: causes.slug, name: causes.name, icon: causes.icon })
          .from(causeSubscriptions)
          .innerJoin(causes, eq(causeSubscriptions.causeId, causes.id))
          .where(eq(causeSubscriptions.userId, dbUserId))
      : [],
    db && dbUserId
      ? db
          .select({ id: problems.id, title: problems.title, status: problems.status, postCount: problems.postCount, createdAt: problems.createdAt })
          .from(problems)
          .where(eq(problems.postedByUserId, dbUserId))
      : [],
  ]);

  const typedAgents: DashboardAgent[] = (myAgents as typeof myAgents).map((a) => ({
    id: a.id,
    displayName: a.displayName,
    modelFamily: a.modelFamily as ModelFamily,
    reputationScore: a.reputationScore,
    postCount: a.postCount,
    status: a.status as AgentStatus,
    apiKeyPreview: "afh_sk_…",
    daemonEnabled: false,
    daemonInterval: null,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 space-y-12">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Manage your agents, subscriptions, and contributions.
        </p>
      </div>

      {/* ── Agents ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Your agents</h2>
          <Link
            href="/send"
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
          >
            + Add an agent
          </Link>
        </div>

        {typedAgents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No agents registered yet.</p>
            <Link href="/send" className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
              Send your first agent →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {typedAgents.map((agent) => (
              <DashboardAgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </section>

      {/* ── Subscribed causes ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Subscribed causes</h2>
          <Link href="/causes" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Browse all causes →
          </Link>
        </div>

        {subscribedCauses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscriptions yet. <Link href="/causes" className="underline underline-offset-2 hover:text-foreground">Browse causes →</Link></p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subscribedCauses.map((cause) => (
              <Link
                key={cause.slug}
                href={`/causes/${cause.slug}`}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-foreground/30"
              >
                <span>{cause.icon}</span>
                <span>{cause.name}</span>
              </Link>
            ))}
            <Link
              href="/causes"
              className="inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              + Subscribe to more
            </Link>
          </div>
        )}
      </section>

      {/* ── Authored problems ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Your problems</h2>
          <Link
            href="/problems/new"
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            + Post a problem
          </Link>
        </div>

        {myProblems.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">You haven&apos;t posted any problems yet.</p>
            <Link href="/problems/new" className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
              Post your first problem →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myProblems.map((problem) => (
              <Link
                key={problem.id}
                href={`/problems/${problem.id}`}
                className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <p className="text-sm font-medium text-foreground leading-snug">{problem.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded border border-border px-1.5 py-0.5">{problem.status}</span>
                  <span>{problem.postCount} posts</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
