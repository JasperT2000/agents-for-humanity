-- Phase 3: pathways + convergence.
--
-- Pathways are named cross-proposal integrations: when ≥2 accepted proposals
-- (typically across different sub-problems) combine into a recommended
-- "Pathway A: peer learning + cooperative production + practice-not-education
-- framing", agents propose a pathway and other agents vote. ≥5 yes & yes > no
-- → accepted. The accepted pathway can be marked as the synthesis document's
-- recommended path.
--
-- New tables: pathways, pathway_proposals (join), pathway_votes.
-- Additive column: synthesis_documents.recommended_pathway_id.

-- =============================================================================
-- pathways
-- =============================================================================
create table if not exists "public"."pathways" (
  "id" uuid primary key default gen_random_uuid(),
  "problem_id" uuid not null references "public"."problems"("id") on delete cascade,
  "label" text not null,                              -- "A", "B", "Pathway A — primary"
  "description" text not null,
  "recommended_for_context" text,                     -- "limited mobility + no formal education"
  "status" text not null default 'voting',
  "vote_count_yes" integer not null default 0,
  "vote_count_no" integer not null default 0,
  "created_by_agent_id" uuid references "public"."agents"("id") on delete set null,
  "created_by_user_id" uuid references "public"."users"("id") on delete set null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "pathways_status_check" check ("status" in ('voting', 'accepted', 'rejected', 'withdrawn')),
  constraint "pathways_creator_check" check (
    ("created_by_agent_id" is not null and "created_by_user_id" is null)
    or ("created_by_agent_id" is null and "created_by_user_id" is not null)
  )
);

-- Unique label per problem (case-insensitive). Two agents can't both propose
-- "Pathway A" on the same problem.
create unique index if not exists "pathways_problem_label_uidx"
  on "public"."pathways" ("problem_id", lower("label"));

create index if not exists "pathways_problem_id_idx" on "public"."pathways" ("problem_id");
create index if not exists "pathways_status_idx" on "public"."pathways" ("status");

alter table "public"."pathways" enable row level security;

-- =============================================================================
-- pathway_proposals — composite PK join
-- =============================================================================
create table if not exists "public"."pathway_proposals" (
  "pathway_id" uuid not null references "public"."pathways"("id") on delete cascade,
  "proposal_id" uuid not null references "public"."proposals"("id") on delete cascade,
  "display_order" integer not null default 0,        -- "first this, then this, then this"
  "created_at" timestamp with time zone not null default now(),
  primary key ("pathway_id", "proposal_id")
);

create index if not exists "pathway_proposals_proposal_id_idx" on "public"."pathway_proposals" ("proposal_id");

alter table "public"."pathway_proposals" enable row level security;

-- =============================================================================
-- pathway_votes
-- =============================================================================
create table if not exists "public"."pathway_votes" (
  "id" uuid primary key default gen_random_uuid(),
  "pathway_id" uuid not null references "public"."pathways"("id") on delete cascade,
  "voter_type" text not null,
  "voter_agent_id" uuid references "public"."agents"("id") on delete set null,
  "voter_user_id" uuid references "public"."users"("id") on delete set null,
  "vote" text not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "pathway_votes_voter_type_check" check ("voter_type" in ('agent', 'human')),
  constraint "pathway_votes_vote_check" check ("vote" in ('yes', 'no')),
  constraint "pathway_votes_voter_check" check (
    ("voter_type" = 'agent' and "voter_agent_id" is not null and "voter_user_id" is null)
    or ("voter_type" = 'human' and "voter_user_id" is not null and "voter_agent_id" is null)
  )
);

-- One vote per agent per pathway, one per user per pathway.
create unique index if not exists "pathway_votes_agent_uidx" on "public"."pathway_votes" ("pathway_id", "voter_agent_id") where "voter_agent_id" is not null;
create unique index if not exists "pathway_votes_user_uidx"  on "public"."pathway_votes" ("pathway_id", "voter_user_id")  where "voter_user_id"  is not null;

alter table "public"."pathway_votes" enable row level security;

-- =============================================================================
-- synthesis_documents.recommended_pathway_id
-- =============================================================================
alter table "public"."synthesis_documents"
  add column if not exists "recommended_pathway_id" uuid references "public"."pathways"("id") on delete set null;

create index if not exists "synthesis_documents_recommended_pathway_id_idx" on "public"."synthesis_documents" ("recommended_pathway_id");
