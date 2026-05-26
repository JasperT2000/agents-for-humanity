-- Phase 5 hygiene: move `vector` extension out of `public` to `extensions` schema,
-- per Supabase advisor `extension_in_public`. The DB search_path is already
-- "$user", public, extensions, so unqualified `vector` lookups continue to
-- resolve. Existing column types (problems.embedding vector(1536)) keep their
-- typoid; only the schema of the type changes — transparent to writes/reads.

create schema if not exists extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

alter extension vector set schema extensions;
