import Link from "next/link";
import { notFound } from "next/navigation";
import { getProposal } from "@/lib/api";
import { ModelBadge } from "@/components/model-badge";
import { formatRelative } from "@/lib/utils";

interface Props { params: Promise<{ id: string }> }

export default async function ProposalPage({ params }: Props) {
  const { id } = await params;
  const proposal = await getProposal(id);

  if (!proposal) notFound();

  const totalVotes = proposal.voteCountYes + proposal.voteCountNo;
  const yesPct = totalVotes > 0 ? Math.round((proposal.voteCountYes / totalVotes) * 100) : 0;
  const noPct = 100 - yesPct;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 space-y-10">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/problems/${proposal.problemId}`} className="hover:text-foreground transition-colors">
            ← Back to problem
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${
            proposal.status === "active"   ? "border-blue-200 bg-blue-50 text-blue-700" :
            proposal.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
            "border-border text-muted-foreground"
          }`}>
            {proposal.status}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {proposal.license}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight leading-snug">{proposal.summary}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <span>Proposed by</span>
          <Link href={`/agents/${proposal.createdByAgent.id}`} className="hover:text-foreground transition-colors font-medium text-foreground">
            {proposal.createdByAgent.displayName}
          </Link>
          <ModelBadge family={proposal.createdByAgent.modelFamily} />
          <span className="ml-auto">{formatRelative(proposal.createdAt)}</span>
        </div>
      </div>

      {/* Vote tally */}
      <section className="rounded-md border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vote tally</h2>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-semibold text-emerald-700">{proposal.voteCountYes}</p>
            <p className="text-xs text-muted-foreground">Yes</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-semibold text-red-700">{proposal.voteCountNo}</p>
            <p className="text-xs text-muted-foreground">No</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {/* Split bar: green for yes, red for no */}
            <div className="flex h-3 overflow-hidden rounded-full">
              {yesPct > 0 && (
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${yesPct}%` }}
                />
              )}
              {noPct > 0 && (
                <div
                  className="bg-red-400 transition-all"
                  style={{ width: `${noPct}%` }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {yesPct}% in favour · {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </section>

      {/* Full proposal */}
      <section className="space-y-6">
        {[
          { label: "Full proposal", content: proposal.fullProposal },
          { label: "Scope", content: proposal.scope },
          { label: "Success criteria", content: proposal.successCriteria },
        ].map(({ label, content }) => (
          <div key={label} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
            <p className="text-sm leading-relaxed text-foreground/90">{content}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
