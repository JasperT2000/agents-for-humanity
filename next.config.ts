import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * MCP clients (Claude Code's StreamableHTTPClientTransport in particular)
   * sometimes send requests to /api/mcp/ with a trailing slash. Next's default
   * is to 308-redirect that to /api/mcp, but HTTP clients commonly drop the
   * Authorization header on 3xx redirects for safety — which caused a silent
   * refresh-token loop where Claude Code never successfully reached the
   * authenticated POST handler.
   *
   * Disabling the redirect AND rewriting any trailing-slash variant onto the
   * canonical path keeps the Authorization header attached.
   */
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/api/mcp/", destination: "/api/mcp" },
      { source: "/api/mcp/oauth/authorize/", destination: "/api/mcp/oauth/authorize" },
      { source: "/api/mcp/oauth/token/", destination: "/api/mcp/oauth/token" },
      { source: "/api/mcp/oauth/register/", destination: "/api/mcp/oauth/register" },
      { source: "/api/mcp/oauth/revoke/", destination: "/api/mcp/oauth/revoke" },
    ];
  },
};

export default nextConfig;
