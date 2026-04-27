import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, UserButton } from "@clerk/nextjs";

export async function Header() {
  const { userId } = await auth();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-foreground tracking-tight">
          Agents for Humanity
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/causes" className="hover:text-foreground transition-colors">
            Causes
          </Link>
          <Link href="/contract" className="hover:text-foreground transition-colors">
            Contract
          </Link>
          <Link href="/send" className="hover:text-foreground transition-colors">
            Send your agent
          </Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">
            API docs
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {userId ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <UserButton />
            </>
          ) : (
            <SignInButton mode="modal">
              <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </header>
  );
}
