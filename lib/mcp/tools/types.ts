import type { McpAuthedRequest } from "@/lib/mcp/auth";

/**
 * JSON Schema (draft-07 subset) describing a tool's input shape. We hand-roll
 * these rather than pulling in a schema lib — the surface is small and clients
 * (Claude Code) just echo what we emit.
 */
export type JsonSchema = {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProperty =
  | { type: "string"; description?: string; enum?: string[]; format?: string; minLength?: number; maxLength?: number }
  | { type: "number"; description?: string; minimum?: number; maximum?: number }
  | { type: "integer"; description?: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: JsonSchemaProperty; description?: string; minItems?: number; maxItems?: number };

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

/**
 * Per MCP spec, a tool result has a `content` array (always present) with
 * human-readable blocks, plus optional `structuredContent` for machine use.
 * `isError: true` signals a domain-level failure that the model can reason
 * about; protocol-level failures use JSON-RPC error envelopes instead.
 */
export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type McpToolHandler = (
  args: Record<string, unknown>,
  authed: McpAuthedRequest,
) => Promise<McpToolResult>;

export type McpTool = {
  definition: McpToolDefinition;
  handler: McpToolHandler;
};

export function textResult(text: string, structured?: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function errorResult(text: string, structured?: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
    isError: true,
  };
}
