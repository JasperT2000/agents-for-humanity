-- MCP OAuth 2.1 scaffolding (PR-B).
--
-- Three tables that back the MCP server's OAuth flow used by Claude Code.
-- Tokens are opaque (bcrypt-hashed at rest), auth codes are one-shot, refresh
-- rotates. PKCE S256 is enforced via a check constraint.

create table if not exists "public"."mcp_oauth_clients" (
  "id" uuid primary key default gen_random_uuid(),
  "client_id" text not null unique,
  "client_name" text not null,
  "redirect_uris" jsonb not null,
  "created_at" timestamp with time zone not null default now()
);

create table if not exists "public"."mcp_oauth_codes" (
  "id" uuid primary key default gen_random_uuid(),
  "code_hash" text not null unique,
  "client_pk" uuid not null references "public"."mcp_oauth_clients"("id") on delete cascade,
  "user_id" uuid not null references "public"."users"("id") on delete cascade,
  "code_challenge" text not null,
  "code_challenge_method" text not null,
  "redirect_uri" text not null,
  "scope" text,
  "expires_at" timestamp with time zone not null,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone not null default now(),
  constraint "mcp_oauth_codes_pkce_method_check" check ("code_challenge_method" = 'S256')
);

create index if not exists "mcp_oauth_codes_user_id_idx" on "public"."mcp_oauth_codes" ("user_id");
create index if not exists "mcp_oauth_codes_expires_at_idx" on "public"."mcp_oauth_codes" ("expires_at");

create table if not exists "public"."mcp_oauth_grants" (
  "id" uuid primary key default gen_random_uuid(),
  "client_pk" uuid not null references "public"."mcp_oauth_clients"("id") on delete cascade,
  "user_id" uuid not null references "public"."users"("id") on delete cascade,
  "access_token_hash" text not null unique,
  "refresh_token_hash" text not null unique,
  "access_token_expires_at" timestamp with time zone not null,
  "refresh_token_expires_at" timestamp with time zone not null,
  "scope" text,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "rotated_from_grant_id" uuid,
  "created_at" timestamp with time zone not null default now()
);

create index if not exists "mcp_oauth_grants_user_id_idx" on "public"."mcp_oauth_grants" ("user_id");
create index if not exists "mcp_oauth_grants_client_pk_idx" on "public"."mcp_oauth_grants" ("client_pk");

-- Defense-in-depth: enable RLS (the route handlers connect with the service
-- role via postgres-js so RLS is bypassed there, but having it on means a
-- mistaken anon-key client cannot read tokens).
alter table "public"."mcp_oauth_clients" enable row level security;
alter table "public"."mcp_oauth_codes" enable row level security;
alter table "public"."mcp_oauth_grants" enable row level security;
