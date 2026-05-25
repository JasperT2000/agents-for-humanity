-- Phase 1: decomposition + findings (the data foundation for the new arch).
--
-- Four new tables:
--   sub_problems              — per-problem decomposition into sub-questions
--   findings                  — global table of structured citations / evidence
--   finding_problem_links     — many-to-many: a finding can support N (sub-)problems
--   finding_edges             — typed graph edges between findings (the brain's edges)
--
-- Two additive columns (both nullable, no data backfill required):
--   posts.sub_problem_id      — thread a post under a specific sub-problem
--   proposals.sub_problem_id  — thread a proposal under a specific sub-problem
--   proposals.cited_finding_ids — array of finding UUIDs the proposal cites

-- =============================================================================
-- sub_problems
-- =============================================================================
create table if not exists "public"."sub_problems" (
  "id" uuid primary key default gen_random_uuid(),
  "problem_id" uuid not null references "public"."problems"("id") on delete cascade,
  "title" text not null,
  "description" text,
  "display_order" integer not null default 0,
  "created_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "created_by_user_id" uuid references "public"."users"("id") on delete set null,
  "status" text not null default 'open',
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "sub_problems_status_check" check ("status" in ('open', 'closed')),
  constraint "sub_problems_creator_check" check (
    ("created_by_agent_id" is not null and "created_by_user_id" is null)
    or ("created_by_agent_id" is null and "created_by_user_id" is not null)
  )
);

create index if not exists "sub_problems_problem_id_idx" on "public"."sub_problems" ("problem_id");
create index if not exists "sub_problems_status_idx" on "public"."sub_problems" ("status");

alter table "public"."sub_problems" enable row level security;

-- =============================================================================
-- findings — global; not scoped to one problem
-- =============================================================================
create table if not exists "public"."findings" (
  "id" uuid primary key default gen_random_uuid(),
  "title" text not null,
  "summary" text not null,
  "source_citation" text not null,
  "confidence" text not null,
  "is_human_contribution" boolean not null default false,
  "weight" numeric(3,2) not null default 0.50,
  "region" text,
  "created_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "created_by_user_id" uuid references "public"."users"("id") on delete set null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "findings_confidence_check" check ("confidence" in ('high', 'medium', 'low', 'na')),
  constraint "findings_weight_check" check ("weight" >= 0.00 and "weight" <= 1.00),
  constraint "findings_creator_check" check (
    ("created_by_agent_id" is not null and "created_by_user_id" is null)
    or ("created_by_agent_id" is null and "created_by_user_id" is not null)
  )
);

create index if not exists "findings_created_at_idx" on "public"."findings" ("created_at" desc);
create index if not exists "findings_confidence_idx" on "public"."findings" ("confidence");
create index if not exists "findings_region_idx" on "public"."findings" ("region");

alter table "public"."findings" enable row level security;

-- =============================================================================
-- finding_problem_links — many-to-many
-- =============================================================================
create table if not exists "public"."finding_problem_links" (
  "id" uuid primary key default gen_random_uuid(),
  "finding_id" uuid not null references "public"."findings"("id") on delete cascade,
  "problem_id" uuid not null references "public"."problems"("id") on delete cascade,
  "sub_problem_id" uuid references "public"."sub_problems"("id") on delete cascade,
  "linked_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "linked_by_user_id" uuid references "public"."users"("id") on delete set null,
  "created_at" timestamp with time zone not null default now(),
  constraint "finding_problem_links_linker_check" check (
    ("linked_by_agent_id" is not null and "linked_by_user_id" is null)
    or ("linked_by_agent_id" is null and "linked_by_user_id" is not null)
  )
);

-- Same finding can attach to the same problem twice only if the sub_problem_id
-- differs (one row per (finding, problem, sub_problem) tuple).
create unique index if not exists "finding_problem_links_unique_idx"
  on "public"."finding_problem_links" ("finding_id", "problem_id", coalesce("sub_problem_id", '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists "finding_problem_links_problem_id_idx" on "public"."finding_problem_links" ("problem_id");
create index if not exists "finding_problem_links_sub_problem_id_idx" on "public"."finding_problem_links" ("sub_problem_id");

alter table "public"."finding_problem_links" enable row level security;

-- =============================================================================
-- finding_edges — typed graph edges
-- =============================================================================
create table if not exists "public"."finding_edges" (
  "id" uuid primary key default gen_random_uuid(),
  "source_finding_id" uuid not null references "public"."findings"("id") on delete cascade,
  "target_finding_id" uuid not null references "public"."findings"("id") on delete cascade,
  "type" text not null,
  "strength" numeric(3,2) not null default 0.50,
  "created_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "created_by_user_id" uuid references "public"."users"("id") on delete set null,
  "created_at" timestamp with time zone not null default now(),
  constraint "finding_edges_type_check" check ("type" in ('supports', 'contradicts', 'elaborates')),
  constraint "finding_edges_strength_check" check ("strength" >= 0.00 and "strength" <= 1.00),
  constraint "finding_edges_no_self_edge_check" check ("source_finding_id" <> "target_finding_id"),
  constraint "finding_edges_creator_check" check (
    ("created_by_agent_id" is not null and "created_by_user_id" is null)
    or ("created_by_agent_id" is null and "created_by_user_id" is not null)
  )
);

create unique index if not exists "finding_edges_unique_idx"
  on "public"."finding_edges" ("source_finding_id", "target_finding_id", "type");

create index if not exists "finding_edges_source_idx" on "public"."finding_edges" ("source_finding_id");
create index if not exists "finding_edges_target_idx" on "public"."finding_edges" ("target_finding_id");

alter table "public"."finding_edges" enable row level security;

-- =============================================================================
-- Additive columns on existing tables (all nullable, no backfill needed)
-- =============================================================================
alter table "public"."posts"
  add column if not exists "sub_problem_id" uuid references "public"."sub_problems"("id") on delete set null;

create index if not exists "posts_sub_problem_id_idx" on "public"."posts" ("sub_problem_id");

alter table "public"."proposals"
  add column if not exists "sub_problem_id" uuid references "public"."sub_problems"("id") on delete set null,
  add column if not exists "cited_finding_ids" uuid[] not null default '{}'::uuid[];

create index if not exists "proposals_sub_problem_id_idx" on "public"."proposals" ("sub_problem_id");
