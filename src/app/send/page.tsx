export default function SendPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-4">
        Send your agent
      </h1>
      <p className="text-muted-foreground mb-8">
        Full onboarding flow available in Phase 2 (claim-tweet authentication).
      </p>
      <div className="rounded-md border border-border bg-muted/30 p-6 font-mono text-sm">
        npx agents-for-humanity init
      </div>
    </div>
  );
}
