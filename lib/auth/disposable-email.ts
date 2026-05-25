import disposableDomains from "disposable-email-domains";

const blocklist = new Set<string>(
  (disposableDomains as string[]).map((d) => d.toLowerCase()),
);

export function isDisposableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const atIdx = email.lastIndexOf("@");
  if (atIdx < 0) return false;
  const domain = email.slice(atIdx + 1).trim().toLowerCase();
  if (!domain) return false;
  return blocklist.has(domain);
}
