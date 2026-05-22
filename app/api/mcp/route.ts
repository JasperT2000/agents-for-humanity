import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { McpAuthError, type McpAuthedRequest, requireMcpAuth } from "@/lib/mcp/auth";
import {
  JRPC_ERR,
  type JsonRpcRequest,
  type JsonRpcResponse,
  err,
  isNotification,
  isValidRequest,
  ok,
} from "@/lib/mcp/jsonrpc";
import { originFromRequest } from "@/lib/mcp/metadata";
import { findTool, getToolDefinitions } from "@/lib/mcp/tools/registry";
import { errorResult, type McpToolResult } from "@/lib/mcp/tools/types";

export const dynamic = "force-dynamic";

/**
 * MCP protocol versions we know we are wire-compatible with. The methods
 * implemented here (initialize, tools/list, ping, notifications/initialized)
 * are unchanged across these revisions, so we echo back whatever a compatible
 * client requests rather than forcing a single version.
 */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INFO = {
  name: "agents-for-humanity",
  version: "0.1.0",
};

// PR-B is intentionally tool-less so we can land OAuth + protocol plumbing
// independently. PR-C registers the first tools (afh_authenticate, afh_*_my_agents, etc.).
const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
};

/**
 * Per the MCP streamable HTTP spec the server returns Mcp-Session-Id on the
 * initialize response and the client echoes it on subsequent requests. We are
 * stateless (the session id is opaque and we don't track it server-side) — the
 * id exists purely so clients that require it can satisfy their own bookkeeping.
 */
const MCP_SESSION_ID_HEADER = "Mcp-Session-Id";

export async function POST(request: Request) {
  // Auth first. Per RFC 9728, on missing/invalid bearer return 401 with a
  // WWW-Authenticate header pointing to the protected-resource metadata.
  let authed;
  try {
    authed = await requireMcpAuth(request);
  } catch (error) {
    if (error instanceof McpAuthError) {
      const origin = originFromRequest(request);
      const body: Record<string, unknown> = {
        error: "invalid_token",
        error_description: error.code,
      };
      if (error.tokenPrefix) body.token_prefix = error.tokenPrefix;
      return new NextResponse(JSON.stringify(body), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      });
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

  const responses: JsonRpcResponse[] = [];
  const requests = Array.isArray(raw) ? raw : [raw];
  const isBatched = Array.isArray(raw);
  let isInitialize = false;

  for (const item of requests) {
    if (!isValidRequest(item)) {
      responses.push(err(null, JRPC_ERR.invalidRequest, "Invalid Request"));
      continue;
    }
    if (item.method === "initialize") isInitialize = true;
    const result = await handleMethod(item, authed);
    if (result && !isNotification(item)) responses.push(result);
  }

  const responseHeaders: Record<string, string> = {};
  // Issue a session id on every initialize so SDKs that require one are happy.
  // The id is opaque; we don't validate it on subsequent requests in v1.
  if (isInitialize) responseHeaders[MCP_SESSION_ID_HEADER] = randomUUID();

  if (responses.length === 0) {
    // All notifications, no response required.
    return new NextResponse(null, { status: 202, headers: responseHeaders });
  }

  return NextResponse.json(isBatched ? responses : responses[0], {
    headers: responseHeaders,
  });
}

async function handleMethod(
  req: JsonRpcRequest,
  authed: McpAuthedRequest,
): Promise<JsonRpcResponse | null> {
  const id = (req.id ?? null) as string | number | null;
  switch (req.method) {
    case "initialize": {
      const requested = readProtocolVersion(req.params);
      const protocolVersion = requested ?? DEFAULT_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion,
        capabilities: SERVER_CAPABILITIES,
        serverInfo: SERVER_INFO,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: getToolDefinitions() });
    case "notifications/initialized":
      // Notification — no response. Just acknowledge so we don't log it as
      // anomalous.
      return null;
    case "tools/call":
      return handleToolsCall(id, req.params, authed);
    default:
      return err(id, JRPC_ERR.methodNotFound, `Method not found: ${req.method}`);
  }
}

async function handleToolsCall(
  id: string | number | null,
  params: unknown,
  authed: McpAuthedRequest,
): Promise<JsonRpcResponse> {
  if (typeof params !== "object" || params === null) {
    return err(id, JRPC_ERR.invalidParams, "tools/call requires an object params");
  }
  const p = params as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== "string") {
    return err(id, JRPC_ERR.invalidParams, "tools/call params.name must be a string");
  }
  const tool = findTool(p.name);
  if (!tool) {
    return err(id, JRPC_ERR.methodNotFound, `No tool named "${p.name}"`);
  }
  const args =
    typeof p.arguments === "object" && p.arguments !== null
      ? (p.arguments as Record<string, unknown>)
      : {};

  let result: McpToolResult;
  try {
    result = await tool.handler(args, authed);
  } catch (toolError) {
    const message = toolError instanceof Error ? toolError.message : "Unknown tool error";
    result = errorResult(`Tool ${p.name} crashed: ${message}`);
  }
  return ok(id, result);
}

function readProtocolVersion(params: unknown): string | null {
  if (typeof params !== "object" || params === null) return null;
  const requested = (params as Record<string, unknown>).protocolVersion;
  if (typeof requested !== "string") return null;
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : null;
}

/**
 * The streamable HTTP transport lets clients open a GET stream to receive
 * server-initiated notifications via SSE. We don't push anything yet, but
 * returning a valid (empty, immediately-closed) SSE stream is what the
 * MCP TypeScript SDK expects — a 405 trips its "session broken" path and
 * causes a refresh-token loop instead of a working connection.
 *
 * Bearer auth is required on this endpoint just like POST: a stream that
 * could be opened anonymously would let unauthenticated clients receive
 * notifications meant for the authed user once we start pushing any.
 */
export async function GET(request: Request) {
  try {
    await requireMcpAuth(request);
  } catch (error) {
    if (error instanceof McpAuthError) {
      const origin = originFromRequest(request);
      const body: Record<string, unknown> = {
        error: "invalid_token",
        error_description: error.code,
      };
      if (error.tokenPrefix) body.token_prefix = error.tokenPrefix;
      return new NextResponse(JSON.stringify(body), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      });
    }
    return new NextResponse(null, { status: 500 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // SSE comment so middleboxes don't drop the empty body; then close.
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
