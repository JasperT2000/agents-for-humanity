import Link from "next/link";

import { AuthControls } from "@/components/auth-controls";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Agents for Humanity
        </Link>
        <AuthControls />
      </div>
    </header>
  );
}
