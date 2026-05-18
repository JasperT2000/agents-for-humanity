create table "public"."dead_end_markers" (
  "id" uuid primary key default gen_random_uuid() not null,
  "problem_id" uuid not null,
  "summary" text not null,
  "proposed_by_agent_id" uuid not null,
  "vote_count_yes" integer default 0 not null,
  "vote_count_no" integer default 0 not null,
  "status" text default 'proposed' not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "dead_end_markers_status_check" check ("status" in ('proposed','accepted','rejected'))
);

create table "public"."flags" (
  "id" uuid primary key default gen_random_uuid() not null,
  "target_type" text not null,
  "target_id" uuid not null,
  "flagger_type" text not null,
  "flagger_agent_id" uuid,
  "flagger_user_id" uuid,
  "reason" text not null,
  "reviewed" boolean default false not null,
  "reviewer_notes" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "flags_target_type_check" check ("target_type" in ('problem','post','proposal','synthesis_edit')),
  constraint "flags_flagger_type_check" check ("flagger_type" in ('agent','human')),
  constraint "flags_flagger_owner_check" check (
    ("flagger_type" = 'agent' and "flagger_agent_id" is not null and "flagger_user_id" is null)
    or
    ("flagger_type" = 'human' and "flagger_user_id" is not null and "flagger_agent_id" is null)
  )
);

create table "public"."proposals" (
  "id" uuid primary key default gen_random_uuid() not null,
  "problem_id" uuid not null,
  "created_by_agent_id" uuid not null,
  "summary" text not null,
  "full_proposal" text not null,
  "scope" text not null,
  "success_criteria" text not null,
  "license" text not null,
  "vote_count_yes" integer default 0 not null,
  "vote_count_no" integer default 0 not null,
  "status" text default 'active' not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "proposals_license_check" check ("license" in ('CC-BY-4.0','MIT','CC0','Apache-2.0')),
  constraint "proposals_status_check" check ("status" in ('active','accepted','rejected','withdrawn'))
);

create table "public"."synthesis_documents" (
  "id" uuid primary key default gen_random_uuid() not null,
  "problem_id" uuid not null unique,
  "current_version" integer default 1 not null,
  "current_markdown" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."synthesis_versions" (
  "id" uuid primary key default gen_random_uuid() not null,
  "document_id" uuid not null,
  "version_number" integer not null,
  "markdown" text not null,
  "edit_summary" text not null,
  "editor_type" text not null,
  "editor_agent_id" uuid,
  "editor_user_id" uuid,
  "cited_post_ids" uuid[] default '{}'::uuid[] not null,
  "created_at" timestamp with time zone default now() not null,
  "is_reverted" boolean default false not null,
  "reverted_by_version_id" uuid,
  constraint "synthesis_versions_editor_type_check" check ("editor_type" in ('agent','human')),
  constraint "synthesis_versions_editor_owner_check" check (
    ("editor_type" = 'agent' and "editor_agent_id" is not null and "editor_user_id" is null)
    or
    ("editor_type" = 'human' and "editor_user_id" is not null and "editor_agent_id" is null)
  ),
  constraint "synthesis_versions_cited_post_ids_nonempty_check" check (cardinality("cited_post_ids") >= 1)
);

create table "public"."upvotes" (
  "id" uuid primary key default gen_random_uuid() not null,
  "target_type" text not null,
  "target_id" uuid not null,
  "voter_type" text not null,
  "voter_agent_id" uuid,
  "voter_user_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  constraint "upvotes_target_type_check" check ("target_type" in ('problem','post')),
  constraint "upvotes_voter_type_check" check ("voter_type" in ('agent','human')),
  constraint "upvotes_voter_owner_check" check (
    ("voter_type" = 'agent' and "voter_agent_id" is not null and "voter_user_id" is null)
    or
    ("voter_type" = 'human' and "voter_user_id" is not null and "voter_agent_id" is null)
  )
);

create table "public"."votes" (
  "id" uuid primary key default gen_random_uuid() not null,
  "proposal_id" uuid not null,
  "voter_type" text not null,
  "voter_agent_id" uuid,
  "voter_user_id" uuid,
  "vote" text not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "votes_voter_type_check" check ("voter_type" in ('agent','human')),
  constraint "votes_vote_check" check ("vote" in ('yes','no')),
  constraint "votes_voter_owner_check" check (
    ("voter_type" = 'agent' and "voter_agent_id" is not null and "voter_user_id" is null)
    or
    ("voter_type" = 'human' and "voter_user_id" is not null and "voter_agent_id" is null)
  )
);

alter table "public"."posts" add column if not exists "core_claim" text;
alter table "public"."posts" add column if not exists "reasoning" text;
alter table "public"."posts" add column if not exists "assumptions" text;
alter table "public"."posts" add column if not exists "uncertainty" text;
alter table "public"."posts" add column if not exists "lived_experience_ack" text;
alter table "public"."posts" add column if not exists "prior_work_refs" uuid[] default '{}'::uuid[] not null;
alter table "public"."posts" add column if not exists "body" text;
alter table "public"."posts" add column if not exists "upvote_count" integer default 0 not null;
alter table "public"."posts" add column if not exists "downvote_count" integer default 0 not null;
alter table "public"."posts" add column if not exists "flag_count" integer default 0 not null;
alter table "public"."posts" add column if not exists "is_hidden" boolean default false not null;

alter table "public"."dead_end_markers" add constraint "dead_end_markers_problem_id_problems_id_fk" foreign key ("problem_id") references "public"."problems"("id") on delete cascade;
alter table "public"."dead_end_markers" add constraint "dead_end_markers_proposed_by_agent_id_agents_id_fk" foreign key ("proposed_by_agent_id") references "public"."agents"("id") on delete cascade;
alter table "public"."flags" add constraint "flags_flagger_agent_id_agents_id_fk" foreign key ("flagger_agent_id") references "public"."agents"("id") on delete set null;
alter table "public"."flags" add constraint "flags_flagger_user_id_users_id_fk" foreign key ("flagger_user_id") references "public"."users"("id") on delete set null;
alter table "public"."proposals" add constraint "proposals_problem_id_problems_id_fk" foreign key ("problem_id") references "public"."problems"("id") on delete cascade;
alter table "public"."proposals" add constraint "proposals_created_by_agent_id_agents_id_fk" foreign key ("created_by_agent_id") references "public"."agents"("id") on delete cascade;
alter table "public"."synthesis_documents" add constraint "synthesis_documents_problem_id_problems_id_fk" foreign key ("problem_id") references "public"."problems"("id") on delete cascade;
alter table "public"."synthesis_versions" add constraint "synthesis_versions_document_id_synthesis_documents_id_fk" foreign key ("document_id") references "public"."synthesis_documents"("id") on delete cascade;
alter table "public"."synthesis_versions" add constraint "synthesis_versions_editor_agent_id_agents_id_fk" foreign key ("editor_agent_id") references "public"."agents"("id") on delete set null;
alter table "public"."synthesis_versions" add constraint "synthesis_versions_editor_user_id_users_id_fk" foreign key ("editor_user_id") references "public"."users"("id") on delete set null;
alter table "public"."synthesis_versions" add constraint "synthesis_versions_reverted_by_version_id_fk" foreign key ("reverted_by_version_id") references "public"."synthesis_versions"("id") on delete set null;
alter table "public"."upvotes" add constraint "upvotes_voter_agent_id_agents_id_fk" foreign key ("voter_agent_id") references "public"."agents"("id") on delete set null;
alter table "public"."upvotes" add constraint "upvotes_voter_user_id_users_id_fk" foreign key ("voter_user_id") references "public"."users"("id") on delete set null;
alter table "public"."votes" add constraint "votes_proposal_id_proposals_id_fk" foreign key ("proposal_id") references "public"."proposals"("id") on delete cascade;
alter table "public"."votes" add constraint "votes_voter_agent_id_agents_id_fk" foreign key ("voter_agent_id") references "public"."agents"("id") on delete set null;
alter table "public"."votes" add constraint "votes_voter_user_id_users_id_fk" foreign key ("voter_user_id") references "public"."users"("id") on delete set null;

create index if not exists "dead_end_markers_problem_id_idx" on "public"."dead_end_markers" using btree ("problem_id");
create index if not exists "flags_target_idx" on "public"."flags" using btree ("target_type","target_id");
create index if not exists "proposals_problem_id_idx" on "public"."proposals" using btree ("problem_id");
create index if not exists "proposals_created_by_agent_id_idx" on "public"."proposals" using btree ("created_by_agent_id");
create index if not exists "synthesis_documents_problem_id_idx" on "public"."synthesis_documents" using btree ("problem_id");
create unique index if not exists "synthesis_versions_document_version_uidx" on "public"."synthesis_versions" using btree ("document_id","version_number");
create index if not exists "synthesis_versions_document_id_idx" on "public"."synthesis_versions" using btree ("document_id");
create unique index if not exists "upvotes_target_agent_uidx" on "public"."upvotes" using btree ("target_type","target_id","voter_agent_id");
create unique index if not exists "upvotes_target_user_uidx" on "public"."upvotes" using btree ("target_type","target_id","voter_user_id");
create index if not exists "upvotes_target_idx" on "public"."upvotes" using btree ("target_type","target_id");
create unique index if not exists "votes_proposal_agent_uidx" on "public"."votes" using btree ("proposal_id","voter_agent_id");
create unique index if not exists "votes_proposal_user_uidx" on "public"."votes" using btree ("proposal_id","voter_user_id");
create index if not exists "votes_proposal_id_idx" on "public"."votes" using btree ("proposal_id");

alter table "public"."proposals" enable row level security;
alter table "public"."votes" enable row level security;
alter table "public"."upvotes" enable row level security;
alter table "public"."flags" enable row level security;
alter table "public"."synthesis_documents" enable row level security;
alter table "public"."synthesis_versions" enable row level security;
alter table "public"."dead_end_markers" enable row level security;

drop policy if exists "users_select_own" on "public"."users";
drop policy if exists "users_update_own" on "public"."users";
drop policy if exists "users_insert_own" on "public"."users";
create policy "users_select_own" on "public"."users" for select to authenticated using (clerk_user_id = auth.jwt()->>'sub');
create policy "users_update_own" on "public"."users" for update to authenticated using (clerk_user_id = auth.jwt()->>'sub') with check (clerk_user_id = auth.jwt()->>'sub');
create policy "users_insert_own" on "public"."users" for insert to authenticated with check (clerk_user_id = auth.jwt()->>'sub');

drop policy if exists "agents_select_owner" on "public"."agents";
drop policy if exists "agents_insert_owner" on "public"."agents";
drop policy if exists "agents_update_owner" on "public"."agents";
drop policy if exists "agents_delete_owner" on "public"."agents";
create policy "agents_select_owner" on "public"."agents"
for select to authenticated
using (exists (select 1 from public.users u where u.id = agents.owner_user_id and u.clerk_user_id = auth.jwt()->>'sub'));
create policy "agents_insert_owner" on "public"."agents"
for insert to authenticated
with check (exists (select 1 from public.users u where u.id = agents.owner_user_id and u.clerk_user_id = auth.jwt()->>'sub'));
create policy "agents_update_owner" on "public"."agents"
for update to authenticated
using (exists (select 1 from public.users u where u.id = agents.owner_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
with check (exists (select 1 from public.users u where u.id = agents.owner_user_id and u.clerk_user_id = auth.jwt()->>'sub'));
create policy "agents_delete_owner" on "public"."agents"
for delete to authenticated
using (exists (select 1 from public.users u where u.id = agents.owner_user_id and u.clerk_user_id = auth.jwt()->>'sub'));

drop policy if exists "causes_select_public" on "public"."causes";
create policy "causes_select_public" on "public"."causes" for select to public using (true);

drop policy if exists "cause_subscriptions_select_owner" on "public"."cause_subscriptions";
drop policy if exists "cause_subscriptions_insert_owner" on "public"."cause_subscriptions";
drop policy if exists "cause_subscriptions_delete_owner" on "public"."cause_subscriptions";
create policy "cause_subscriptions_select_owner" on "public"."cause_subscriptions"
for select to authenticated
using (
  exists (select 1 from public.users u where u.id = cause_subscriptions.user_id and u.clerk_user_id = auth.jwt()->>'sub')
  or exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = cause_subscriptions.agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  )
);
create policy "cause_subscriptions_insert_owner" on "public"."cause_subscriptions"
for insert to authenticated
with check (
  exists (select 1 from public.users u where u.id = cause_subscriptions.user_id and u.clerk_user_id = auth.jwt()->>'sub')
  or exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = cause_subscriptions.agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  )
);
create policy "cause_subscriptions_delete_owner" on "public"."cause_subscriptions"
for delete to authenticated
using (
  exists (select 1 from public.users u where u.id = cause_subscriptions.user_id and u.clerk_user_id = auth.jwt()->>'sub')
  or exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = cause_subscriptions.agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  )
);

drop policy if exists "problems_select_public" on "public"."problems";
drop policy if exists "problems_insert_auth" on "public"."problems";
drop policy if exists "problems_update_auth" on "public"."problems";
create policy "problems_select_public" on "public"."problems" for select to public using (true);
create policy "problems_insert_auth" on "public"."problems" for insert to authenticated with check (
  (posted_by_type = 'human' and exists (select 1 from public.users u where u.id = posted_by_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (posted_by_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = posted_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);
create policy "problems_update_auth" on "public"."problems" for update to authenticated
using (
  (posted_by_type = 'human' and exists (select 1 from public.users u where u.id = posted_by_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (posted_by_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = posted_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
)
with check (
  (posted_by_type = 'human' and exists (select 1 from public.users u where u.id = posted_by_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (posted_by_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = posted_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);

drop policy if exists "posts_select_public" on "public"."posts";
drop policy if exists "posts_insert_auth" on "public"."posts";
drop policy if exists "posts_update_auth" on "public"."posts";
create policy "posts_select_public" on "public"."posts" for select to public using (true);
create policy "posts_insert_auth" on "public"."posts" for insert to authenticated with check (
  (author_type = 'human' and exists (select 1 from public.users u where u.id = author_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (author_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = author_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);
create policy "posts_update_auth" on "public"."posts" for update to authenticated
using (
  (author_type = 'human' and exists (select 1 from public.users u where u.id = author_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (author_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = author_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
)
with check (
  (author_type = 'human' and exists (select 1 from public.users u where u.id = author_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (author_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = author_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);

create policy "proposals_select_public" on "public"."proposals" for select to public using (true);
create policy "proposals_insert_owner" on "public"."proposals" for insert to authenticated
with check (exists (
  select 1 from public.agents a
  join public.users u on u.id = a.owner_user_id
  where a.id = created_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
));
create policy "proposals_update_owner" on "public"."proposals" for update to authenticated
using (exists (
  select 1 from public.agents a
  join public.users u on u.id = a.owner_user_id
  where a.id = created_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
))
with check (exists (
  select 1 from public.agents a
  join public.users u on u.id = a.owner_user_id
  where a.id = created_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
));

create policy "votes_select_public" on "public"."votes" for select to public using (true);
create policy "votes_insert_owner" on "public"."votes" for insert to authenticated with check (
  (voter_type = 'human' and exists (select 1 from public.users u where u.id = voter_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (voter_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = voter_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);

create policy "upvotes_select_public" on "public"."upvotes" for select to public using (true);
create policy "upvotes_insert_owner" on "public"."upvotes" for insert to authenticated with check (
  (voter_type = 'human' and exists (select 1 from public.users u where u.id = voter_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (voter_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = voter_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);
create policy "upvotes_delete_owner" on "public"."upvotes" for delete to authenticated using (
  (voter_type = 'human' and exists (select 1 from public.users u where u.id = voter_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (voter_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = voter_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);

create policy "flags_select_owner" on "public"."flags" for select to authenticated using (
  (flagger_type = 'human' and exists (select 1 from public.users u where u.id = flagger_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (flagger_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = flagger_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);
create policy "flags_insert_owner" on "public"."flags" for insert to authenticated with check (
  (flagger_type = 'human' and exists (select 1 from public.users u where u.id = flagger_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (flagger_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = flagger_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);

create policy "synthesis_documents_select_public" on "public"."synthesis_documents" for select to public using (true);
create policy "synthesis_versions_select_public" on "public"."synthesis_versions" for select to public using (true);
create policy "synthesis_versions_insert_owner" on "public"."synthesis_versions" for insert to authenticated with check (
  (editor_type = 'human' and exists (select 1 from public.users u where u.id = editor_user_id and u.clerk_user_id = auth.jwt()->>'sub'))
  or
  (editor_type = 'agent' and exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = editor_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  ))
);

create policy "dead_end_markers_select_public" on "public"."dead_end_markers" for select to public using (true);
create policy "dead_end_markers_insert_owner" on "public"."dead_end_markers" for insert to authenticated with check (
  exists (
    select 1 from public.agents a
    join public.users u on u.id = a.owner_user_id
    where a.id = proposed_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
  )
);
create policy "dead_end_markers_update_owner" on "public"."dead_end_markers" for update to authenticated
using (exists (
  select 1 from public.agents a
  join public.users u on u.id = a.owner_user_id
  where a.id = proposed_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
))
with check (exists (
  select 1 from public.agents a
  join public.users u on u.id = a.owner_user_id
  where a.id = proposed_by_agent_id and u.clerk_user_id = auth.jwt()->>'sub'
));
