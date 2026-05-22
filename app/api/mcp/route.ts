import { NextResponse } from "next/server";

import { McpAuthError, requireMcpAuth } from "@/lib/mcp/auth";
import {
  JRPC_ERR,
  type JsonRpcRequest,
  type JsonRpcResponse,
  err,
  isNotification,
  isValidRequest,
  ok,
} from "@/lib/mcp/jsonrpc";
import { MCP_RESOURCE_PATH, originFromRequest } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

/**
 * MCP 2025-06-18 spec version we advertise on initialize. Update when we
 * upgrade implementations of new spec features.
 */
const MCP_PROTOCOL_VERSION = "2025-06-18";

const SERVER_INFO = {
  name: "agents-for-humanity",
  version: "0.1.0",
};

// PR-B is intentionally tool-less so we can land OAuth + protocol plumbing
// independently. PR-C registers the first tools (afh_authenticate, afh_*_my_agents, etc.).
const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
};

export async function POST(request: Request) {
  // Auth first. Per RFC 9728, on missing/invalid bearer return 401 with a
  // WWW-Authenticate header pointing to the protected-resource metadata.
  let authed;
  try {
    authed = await requireMcpAuth(request);
  } catch (error) {
    if (error instanceof McpAuthError) {
      const origin = originFromRequest(request);
      return new NextResponse(
        JSON.stringify({
          error: "invalid_token",
          error_description: error.code,
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          },
        },
      );
    }
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      err(null, JRPC_ERR.parse, "Parse error: invalid JSON"),
      { status: 200 },
    );
  }

  // authed is bound for future tool dispatch; PR-B has no tools so we
  // bind it here purely as a side-effect of validation. PR-C wires it through.
  void authed;

  const responses: JsonRpcResponse[] = [];
  const requests = Array.isArray(raw) ? raw : [raw];
  const isBatched = Array.isArray(raw);

  for (const item of requests) {
    if (!isValidRequest(item)) {
      responses.push(err(null, JRPC_ERR.invalidRequest, "Invalid Request"));
      continue;
    }
    const result = await handleMethod(item);
    if (result && !isNotification(item)) responses.push(result);
  }

  if (responses.length === 0) {
    // All notifications, no response required.
    return new NextResponse(null, { status: 202 });
  }

  return NextResponse.json(isBatched ? responses : responses[0]);
}

async function handleMethod(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = (req.id ?? null) as string | number | null;
  switch (req.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: SERVER_CAPABILITIES,
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: [] });
    case "notifications/initialized":
      // Notification — no response. Just acknowledge auth so we don't log it
      // as anomalous.
      return null;
    case "tools/call":
      return err(
        id,
        JRPC_ERR.methodNotFound,
        "No tools are registered on this server yet (PR-B is OAuth-only; PR-C adds the first tools).",
      );
    default:
      return err(id, JRPC_ERR.methodNotFound, `Method not found: ${req.method}`);
  }
}

/**
 * GET on the MCP endpoint is used by some clients to test server reachability
 * (and per the spec it can return an SSE stream for server→client notifications,
 * which we don't yet support). For now respond with a hint pointing at the
 * protected-resource metadata.
 */
export async function GET(request: Request) {
  const origin = originFromRequest(request);
  return NextResponse.json(
    {
      message:
        "Agents for Humanity MCP server. POST JSON-RPC 2.0 requests here with a Bearer token.",
      resource: `${origin}${MCP_RESOURCE_PATH}`,
      protected_resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
