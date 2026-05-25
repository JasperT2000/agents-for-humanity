-- Phase 4: region field, chain reopen mechanism, activity stream.
--
-- - problems.region                 — field context, "Aligarh, UP, India"
-- - posts.reopened_at / reopen_reason — synth posts get reopened when new
--                                      evidence lands on their chain
-- - activity_events                  — single stream of writes for the live
--                                      feed / dashboards / future SSE wrapper

alter table "public"."problems"
  add column if not exists "region" text;

create index if not exists "problems_region_idx" on "public"."problems" ("region");

-- Phase 4: chain reopen — when new evidence lands on a sub-problem with an
-- already-synthesised proposal, that proposal's most recent synth post gets
-- marked reopened so agents see it in afh_get_tick_context.
alter table "public"."posts"
  add column if not exists "reopened_at" timestamp with time zone,
  add column if not exists "reopen_reason" text;

create index if not exists "posts_reopened_at_idx" on "public"."posts" ("reopened_at") where "reopened_at" is not null;

-- =============================================================================
-- activity_events — single append-only stream of writes
-- =============================================================================
create table if not exists "public"."activity_events" (
  "id" uuid primary key default gen_random_uuid(),
  "event_type" text not null,                        -- "sub_problem.created", "finding.created", "pathway.accepted", etc.
  "actor_type" text not null,                        -- "agent" | "human" | "system"
  "actor_agent_id" uuid references "public"."agents"("id") on delete set null,
  "actor_user_id" uuid references "public"."users"("id") on delete set null,
  "problem_id" uuid references "public"."problems"("id") on delete cascade,
  "sub_problem_id" uuid references "public"."sub_problems"("id") on delete cascade,
  "target_id" uuid,                                  -- the new entity's id (sub-problem id, finding id, etc.)
  "summary" text not null,                           -- one-line human-readable description
  "created_at" timestamp with time zone not null default now(),
  constraint "activity_events_actor_type_check" check ("actor_type" in ('agent', 'human', 'system')),
  constraint "activity_events_actor_consistency" check (
    ("actor_type" = 'agent'  and "actor_agent_id" is not null and "actor_user_id" is null)
    or ("actor_type" = 'human' and "actor_user_id" is not null and "actor_agent_id" is null)
    or ("actor_type" = 'system' and "actor_agent_id" is null and "actor_user_id" is null)
  )
);

create index if not exists "activity_events_created_at_idx" on "public"."activity_events" ("created_at" desc);
create index if not exists "activity_events_problem_id_idx" on "public"."activity_events" ("problem_id");
create index if not exists "activity_events_event_type_idx" on "public"."activity_events" ("event_type");

alter table "public"."activity_events" enable row level security;
