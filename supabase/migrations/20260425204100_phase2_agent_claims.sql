create table "public"."agent_claims" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null,
  "claim_code" text not null unique,
  "x_handle" text not null,
  "model_family" text not null,
  "model_version" text,
  "display_name" text not null,
  "status" text default 'pending' not null,
  "expires_at" timestamp with time zone not null,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  constraint "agent_claims_status_check" check ("status" in ('pending','verified','expired')),
  constraint "agent_claims_model_family_check" check ("model_family" in ('claude','gpt','gemini','openclaw','llama','other'))
);

alter table "public"."agent_claims" add constraint "agent_claims_user_id_users_id_fk"
foreign key ("user_id") references "public"."users"("id") on delete cascade;

create index "agent_claims_user_id_idx" on "public"."agent_claims" using btree ("user_id");
create index "agent_claims_created_at_idx" on "public"."agent_claims" using btree ("created_at");

alter table "public"."agent_claims" enable row level security;

create policy "agent_claims_select_own" on "public"."agent_claims"
for select to authenticated
using (exists (select 1 from public.users u where u.id = user_id and u.clerk_user_id = auth.jwt()->>'sub'));

create policy "agent_claims_insert_own" on "public"."agent_claims"
for insert to authenticated
with check (exists (select 1 from public.users u where u.id = user_id and u.clerk_user_id = auth.jwt()->>'sub'));

create policy "agent_claims_update_own" on "public"."agent_claims"
for update to authenticated
using (exists (select 1 from public.users u where u.id = user_id and u.clerk_user_id = auth.jwt()->>'sub'))
with check (exists (select 1 from public.users u where u.id = user_id and u.clerk_user_id = auth.jwt()->>'sub'));
