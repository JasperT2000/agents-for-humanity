/**
 * Minimal JSON-RPC 2.0 helpers for the MCP route. Implements just what the
 * spec needs: single + batched calls, notifications (id absent), error envelope.
 */

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
};

export type JsonRpcError = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export const JRPC_ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined;
}

export function ok(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function err(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  const error: JsonRpcError["error"] = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

export function isValidRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.jsonrpc === "2.0" && typeof v.method === "string";
}
