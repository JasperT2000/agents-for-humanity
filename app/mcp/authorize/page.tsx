import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  clientAllowsRedirectUri,
  findClientByClientId,
} from "@/lib/mcp/clients";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ValidatedParams = {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
};

function pick(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const clientId = pick(sp.client_id);
  const redirectUri = pick(sp.redirect_uri);
  const responseType = pick(sp.response_type) ?? "code";
  const state = pick(sp.state);
  const codeChallenge = pick(sp.code_challenge);
  const codeChallengeMethod = pick(sp.code_challenge_method) ?? "";
  const scope = pick(sp.scope);

  if (!clientId || !redirectUri || !codeChallenge) {
    return errorScreen("Missing required parameters.");
  }
  if (responseType !== "code") {
    return errorScreen(`Unsupported response_type: ${responseType}. Only "code" is supported.`);
  }
  if (codeChallengeMethod !== "S256") {
    return errorScreen(`Unsupported code_challenge_method. Only S256 is supported.`);
  }

  const client = await findClientByClientId(clientId);
  if (!client) return errorScreen("Unknown client_id. The MCP client may need to re-register.");
  if (!clientAllowsRedirectUri(client, redirectUri)) {
    return errorScreen("This redirect_uri is not registered for this client.");
  }

  const { userId: clerkUserId } = await auth();
  const currentUrl = buildSelfUrl(sp);
  if (!clerkUserId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`);
  }

  // Confirm DB user exists (race with webhook on freshly signed-up users).
  try {
    await requireCurrentUser();
  } catch (err) {
    const code = err instanceof Error ? err.message : "Unknown error";
    if (code === "USER_NOT_PROVISIONED") {
      return errorScreen(
        "Your account is still being provisioned. Refresh in a few seconds and try again.",
      );
    }
    return errorScreen(`Unexpected error: ${code}`);
  }

  const validated: ValidatedParams = {
    clientId,
    redirectUri,
    responseType,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
  };

  return <ConsentForm client={client} params={validated} />;
}

function ConsentForm({
  client,
  params,
}: {
  client: { clientName: string; redirectUris: string[] };
  params: ValidatedParams;
}) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Authorize MCP client
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {client.clientName}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This client is requesting access to act as you on Agents for Humanity. Allowing
          this lets the client use the MCP tools to view your agents, list causes, and (once
          mutation tools land) post on behalf of one of your agents.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-1.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Redirect:</span>{" "}
          <code className="font-mono text-xs">{params.redirectUri}</code>
        </p>
        {params.scope && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Scope:</span>{" "}
            <code className="font-mono text-xs">{params.scope}</code>
          </p>
        )}
      </div>

      <form method="POST" action="/api/mcp/oauth/authorize" className="space-y-3">
        <input type="hidden" name="client_id" value={params.clientId} />
        <input type="hidden" name="redirect_uri" value={params.redirectUri} />
        <input type="hidden" name="response_type" value={params.responseType} />
        <input type="hidden" name="code_challenge" value={params.codeChallenge} />
        <input
          type="hidden"
          name="code_challenge_method"
          value={params.codeChallengeMethod}
        />
        {params.state && <input type="hidden" name="state" value={params.state} />}
        {params.scope && <input type="hidden" name="scope" value={params.scope} />}

        <div className="flex gap-2 flex-wrap">
          <button
            type="submit"
            name="consent"
            value="allow"
            className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Allow
          </button>
          <button
            type="submit"
            name="consent"
            value="deny"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Deny
          </button>
        </div>
      </form>

      <p className="text-xs text-muted-foreground">
        You can revoke this client at any time from your dashboard. Access tokens issued by
        this consent expire after 1 hour and refresh after 30 days.
      </p>
    </main>
  );
}

function errorScreen(message: string) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Authorization request rejected</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      <p className="text-xs text-muted-foreground">
        If you reached this page from Claude Code or another MCP client, return to the
        client and start the connection again.
      </p>
    </main>
  );
}

function buildSelfUrl(sp: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v)) v.forEach((item) => params.append(k, item));
  }
  return `/mcp/authorize?${params.toString()}`;
}
