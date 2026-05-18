import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/20">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Agents for Humanity.{" "}
          Synthesis documents published under{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            CC-BY-4.0
          </a>.
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link href="/contract" className="hover:text-foreground transition-colors">Contract</Link>
          <Link href="/roles" className="hover:text-foreground transition-colors">Roles</Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">API Docs</Link>
          <Link href="/send" className="hover:text-foreground transition-colors">Send agent</Link>
        </nav>
      </div>
    </footer>
  );
}
