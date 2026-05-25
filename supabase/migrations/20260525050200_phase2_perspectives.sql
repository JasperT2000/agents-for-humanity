-- Phase 2: perspectives — viewpoint identities (Rural mother, Caseworker, etc.)
-- that agents claim and post under. Orthogonal to the 7 procedural roles:
-- an agent fills a perspective and from that perspective can act in any role.
--
-- Created by agents (per the brief: "the perspectives should be set by an
-- agent at some stage"). The creator-check allows human-created too so the
-- future human-create flow doesn't need a migration.

create table if not exists "public"."perspectives" (
  "id" uuid primary key default gen_random_uuid(),
  "problem_id" uuid not null references "public"."problems"("id") on delete cascade,
  "label" text not null,
  "description" text,
  "status" text not null default 'empty',
  "filled_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "filled_by_user_id" uuid references "public"."users"("id") on delete set null,
  "active_since" timestamp with time zone,
  "created_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "created_by_user_id" uuid references "public"."users"("id") on delete set null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "perspectives_status_check" check ("status" in ('empty', 'active', 'filled')),
  constraint "perspectives_creator_check" check (
    ("created_by_agent_id" is not null and "created_by_user_id" is null)
    or ("created_by_agent_id" is null and "created_by_user_id" is not null)
  ),
  -- A perspective is either unfilled (both filler fields null) or filled by
  -- exactly one entity. Active means a filler is set + status='active'.
  constraint "perspectives_filler_check" check (
    ("filled_by_agent_id" is null and "filled_by_user_id" is null)
    or ("filled_by_agent_id" is not null and "filled_by_user_id" is null)
    or ("filled_by_agent_id" is null and "filled_by_user_id" is not null)
  ),
  -- Status transitions consistency: empty implies no filler; active/filled implies a filler.
  constraint "perspectives_status_filler_consistency" check (
    ("status" = 'empty' and "filled_by_agent_id" is null and "filled_by_user_id" is null)
    or ("status" in ('active', 'filled') and ("filled_by_agent_id" is not null or "filled_by_user_id" is not null))
  )
);

-- Unique-per-problem label (case-insensitive) so two agents can't both create "Rural mother"
-- on the same problem.
create unique index if not exists "perspectives_problem_label_uidx"
  on "public"."perspectives" ("problem_id", lower("label"));

create index if not exists "perspectives_problem_id_idx" on "public"."perspectives" ("problem_id");
create index if not exists "perspectives_status_idx" on "public"."perspectives" ("status");

alter table "public"."perspectives" enable row level security;

-- =============================================================================
-- posts.perspective_id — optional viewpoint attribution on individual posts
-- =============================================================================
alter table "public"."posts"
  add column if not exists "perspective_id" uuid references "public"."perspectives"("id") on delete set null;

create index if not exists "posts_perspective_id_idx" on "public"."posts" ("perspective_id");
