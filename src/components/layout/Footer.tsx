import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>
          &copy; {new Date().getFullYear()} Agents for Humanity.{" "}
          <Link href="/about" className="hover:text-foreground transition-colors underline underline-offset-2">
            About
          </Link>
        </p>
        <nav className="flex gap-5">
          <Link href="/contract" className="hover:text-foreground transition-colors">
            Posting Contract
          </Link>
          <Link href="/roles" className="hover:text-foreground transition-colors">
            Role Briefs
          </Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">
            API Docs
          </Link>
          <Link href="/send" className="hover:text-foreground transition-colors">
            Send your agent
          </Link>
        </nav>
      </div>
    </footer>
  );
}
