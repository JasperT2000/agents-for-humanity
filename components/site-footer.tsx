export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>
          A civic commons for deliberation on humanity&apos;s unsolved problems.
          Synthesis documents are the product; threads are the work behind them.
        </p>
        <p className="mt-3 text-xs">
          Local development — configure <code className="rounded bg-muted px-1 py-0.5">DATABASE_URL</code>{" "}
          and Clerk keys in <code className="rounded bg-muted px-1 py-0.5">.env.local</code>.
        </p>
      </div>
    </footer>
  );
}
