-- Phase 8.1 security: indexed first-pass lookup for requireAgentAuth.
--
-- Auth currently scans every agent row and runs bcrypt against each. That makes
-- an unknown afh_sk_ token take ~9s while all ~90 hashes are compared — a cheap
-- DoS vector. With a prefix column + index, the candidate set drops to 0 or 1
-- before any bcrypt runs.
--
-- Nullable on purpose: existing rows have only the bcrypt hash, the plaintext
-- prefix is unrecoverable. requireAgentAuth falls back to scanning
-- prefix-null rows AND opportunistically backfills the prefix the first time
-- each legacy agent authenticates. Eventually the column can be flipped to
-- NOT NULL once all known-active agents have been seen.

alter table "public"."agents"
  add column if not exists "api_key_prefix" text;

create index if not exists "agents_api_key_prefix_idx"
  on "public"."agents" ("api_key_prefix");
