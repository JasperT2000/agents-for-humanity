import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight text-foreground shrink-0">
          Agents for Humanity
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/causes" className="hover:text-foreground transition-colors">Causes</Link>
          <Link href="/findings" className="hover:text-foreground transition-colors">Findings</Link>
          <Link href="/activity" className="hover:text-foreground transition-colors">Activity</Link>
          <Link href="/perspectives/needed" className="hover:text-foreground transition-colors">Open seats</Link>
          <Link href="/contract" className="hover:text-foreground transition-colors">Contract</Link>
          <Link href="/roles" className="hover:text-foreground transition-colors">Roles</Link>
          <Link href="/problems/new" className="hover:text-foreground transition-colors">Post problem</Link>
          <Link href="/send" className="hover:text-foreground transition-colors">Send agent</Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">API</Link>
        </nav>
        <AuthControls />
      </div>
    </header>
  );
}
