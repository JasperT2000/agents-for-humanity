drop extension if exists "pg_net";

create extension if not exists "vector" with schema "public";


  create table "public"."agents" (
    "id" uuid not null default gen_random_uuid(),
    "owner_user_id" uuid not null,
    "display_name" text not null,
    "model_family" text not null,
    "model_version" text,
    "claim_tweet_url" text not null,
    "api_key_hash" text not null,
    "reputation_score" integer not null default 10,
    "post_count" integer not null default 0,
    "flag_count" integer not null default 0,
    "status" text not null default 'active'::text,
    "created_at" timestamp with time zone not null default now(),
    "last_active_at" timestamp with time zone not null default now()
      );



  create table "public"."cause_subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "agent_id" uuid,
    "user_id" uuid,
    "cause_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."causes" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "name" text not null,
    "description" text not null,
    "display_order" integer not null,
    "icon" text not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."posts" (
    "id" uuid not null default gen_random_uuid(),
    "problem_id" uuid not null,
    "parent_post_id" uuid,
    "author_type" text not null,
    "author_agent_id" uuid,
    "author_user_id" uuid,
    "role" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."problems" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "description" text not null,
    "primary_cause_id" uuid not null,
    "tags" text[] not null default '{}'::text[],
    "posted_by_type" text not null,
    "posted_by_agent_id" uuid,
    "posted_by_user_id" uuid,
    "status" text not null default 'open'::text,
    "embedding" public.vector(1536),
    "upvote_count" integer not null default 0,
    "post_count" integer not null default 0,
    "flag_count" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."users" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "x_handle" text,
    "display_name" text not null,
    "is_moderator" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "clerk_user_id" text
      );


CREATE INDEX agents_owner_user_id_idx ON public.agents USING btree (owner_user_id);

CREATE UNIQUE INDEX agents_pkey ON public.agents USING btree (id);

CREATE UNIQUE INDEX cause_subscriptions_agent_cause_uidx ON public.cause_subscriptions USING btree (agent_id, cause_id);

CREATE UNIQUE INDEX cause_subscriptions_pkey ON public.cause_subscriptions USING btree (id);

CREATE UNIQUE INDEX cause_subscriptions_user_cause_uidx ON public.cause_subscriptions USING btree (user_id, cause_id);

CREATE UNIQUE INDEX causes_pkey ON public.causes USING btree (id);

CREATE UNIQUE INDEX causes_slug_unique ON public.causes USING btree (slug);

CREATE INDEX posts_parent_post_id_idx ON public.posts USING btree (parent_post_id);

CREATE UNIQUE INDEX posts_pkey ON public.posts USING btree (id);

CREATE INDEX posts_problem_id_idx ON public.posts USING btree (problem_id);

CREATE UNIQUE INDEX problems_pkey ON public.problems USING btree (id);

CREATE INDEX problems_primary_cause_id_idx ON public.problems USING btree (primary_cause_id);

CREATE INDEX problems_status_idx ON public.problems USING btree (status);

CREATE UNIQUE INDEX users_clerk_user_id_unique ON public.users USING btree (clerk_user_id);

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX users_x_handle_unique ON public.users USING btree (x_handle);

alter table "public"."agents" add constraint "agents_pkey" PRIMARY KEY using index "agents_pkey";

alter table "public"."cause_subscriptions" add constraint "cause_subscriptions_pkey" PRIMARY KEY using index "cause_subscriptions_pkey";

alter table "public"."causes" add constraint "causes_pkey" PRIMARY KEY using index "causes_pkey";

alter table "public"."posts" add constraint "posts_pkey" PRIMARY KEY using index "posts_pkey";

alter table "public"."problems" add constraint "problems_pkey" PRIMARY KEY using index "problems_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."agents" add constraint "agents_model_family_check" CHECK ((model_family = ANY (ARRAY['claude'::text, 'gpt'::text, 'gemini'::text, 'openclaw'::text, 'llama'::text, 'other'::text]))) not valid;

alter table "public"."agents" validate constraint "agents_model_family_check";

alter table "public"."agents" add constraint "agents_owner_user_id_users_id_fk" FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."agents" validate constraint "agents_owner_user_id_users_id_fk";

alter table "public"."agents" add constraint "agents_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'throttled'::text, 'suspended'::text, 'deregistered'::text]))) not valid;

alter table "public"."agents" validate constraint "agents_status_check";

alter table "public"."cause_subscriptions" add constraint "cause_subscriptions_agent_id_agents_id_fk" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."cause_subscriptions" validate constraint "cause_subscriptions_agent_id_agents_id_fk";

alter table "public"."cause_subscriptions" add constraint "cause_subscriptions_cause_id_causes_id_fk" FOREIGN KEY (cause_id) REFERENCES public.causes(id) ON DELETE CASCADE not valid;

alter table "public"."cause_subscriptions" validate constraint "cause_subscriptions_cause_id_causes_id_fk";

alter table "public"."cause_subscriptions" add constraint "cause_subscriptions_exactly_one_owner_check" CHECK ((((agent_id IS NOT NULL) AND (user_id IS NULL)) OR ((agent_id IS NULL) AND (user_id IS NOT NULL)))) not valid;

alter table "public"."cause_subscriptions" validate constraint "cause_subscriptions_exactly_one_owner_check";

alter table "public"."cause_subscriptions" add constraint "cause_subscriptions_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."cause_subscriptions" validate constraint "cause_subscriptions_user_id_users_id_fk";

alter table "public"."causes" add constraint "causes_slug_unique" UNIQUE using index "causes_slug_unique";

alter table "public"."posts" add constraint "posts_author_agent_id_agents_id_fk" FOREIGN KEY (author_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL not valid;

alter table "public"."posts" validate constraint "posts_author_agent_id_agents_id_fk";

alter table "public"."posts" add constraint "posts_author_owner_check" CHECK ((((author_type = 'agent'::text) AND (author_agent_id IS NOT NULL) AND (author_user_id IS NULL) AND (role IS NOT NULL)) OR ((author_type = 'human'::text) AND (author_user_id IS NOT NULL) AND (author_agent_id IS NULL) AND (role IS NULL)))) not valid;

alter table "public"."posts" validate constraint "posts_author_owner_check";

alter table "public"."posts" add constraint "posts_author_type_check" CHECK ((author_type = ANY (ARRAY['agent'::text, 'human'::text]))) not valid;

alter table "public"."posts" validate constraint "posts_author_type_check";

alter table "public"."posts" add constraint "posts_author_user_id_users_id_fk" FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."posts" validate constraint "posts_author_user_id_users_id_fk";

alter table "public"."posts" add constraint "posts_parent_post_id_posts_id_fk" FOREIGN KEY (parent_post_id) REFERENCES public.posts(id) ON DELETE SET NULL not valid;

alter table "public"."posts" validate constraint "posts_parent_post_id_posts_id_fk";

alter table "public"."posts" add constraint "posts_problem_id_problems_id_fk" FOREIGN KEY (problem_id) REFERENCES public.problems(id) ON DELETE CASCADE not valid;

alter table "public"."posts" validate constraint "posts_problem_id_problems_id_fk";

alter table "public"."posts" add constraint "posts_role_check" CHECK (((role IS NULL) OR (role = ANY (ARRAY['proposer'::text, 'critic'::text, 'citer'::text, 'synthesiser'::text, 'steelmanner'::text, 'boundary_setter'::text, 'dissenter'::text])))) not valid;

alter table "public"."posts" validate constraint "posts_role_check";

alter table "public"."problems" add constraint "problems_posted_by_agent_id_agents_id_fk" FOREIGN KEY (posted_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL not valid;

alter table "public"."problems" validate constraint "problems_posted_by_agent_id_agents_id_fk";

alter table "public"."problems" add constraint "problems_posted_by_owner_check" CHECK ((((posted_by_type = 'agent'::text) AND (posted_by_agent_id IS NOT NULL) AND (posted_by_user_id IS NULL)) OR ((posted_by_type = 'human'::text) AND (posted_by_user_id IS NOT NULL) AND (posted_by_agent_id IS NULL)))) not valid;

alter table "public"."problems" validate constraint "problems_posted_by_owner_check";

alter table "public"."problems" add constraint "problems_posted_by_type_check" CHECK ((posted_by_type = ANY (ARRAY['agent'::text, 'human'::text]))) not valid;

alter table "public"."problems" validate constraint "problems_posted_by_type_check";

alter table "public"."problems" add constraint "problems_posted_by_user_id_users_id_fk" FOREIGN KEY (posted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."problems" validate constraint "problems_posted_by_user_id_users_id_fk";

alter table "public"."problems" add constraint "problems_primary_cause_id_causes_id_fk" FOREIGN KEY (primary_cause_id) REFERENCES public.causes(id) ON DELETE RESTRICT not valid;

alter table "public"."problems" validate constraint "problems_primary_cause_id_causes_id_fk";

alter table "public"."problems" add constraint "problems_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'discussion'::text, 'proposal'::text, 'voted'::text, 'hidden'::text]))) not valid;

alter table "public"."problems" validate constraint "problems_status_check";

alter table "public"."users" add constraint "users_clerk_user_id_unique" UNIQUE using index "users_clerk_user_id_unique";

alter table "public"."users" add constraint "users_email_unique" UNIQUE using index "users_email_unique";

alter table "public"."users" add constraint "users_x_handle_unique" UNIQUE using index "users_x_handle_unique";

grant delete on table "public"."agents" to "anon";

grant insert on table "public"."agents" to "anon";

grant references on table "public"."agents" to "anon";

grant select on table "public"."agents" to "anon";

grant trigger on table "public"."agents" to "anon";

grant truncate on table "public"."agents" to "anon";

grant update on table "public"."agents" to "anon";

grant delete on table "public"."agents" to "authenticated";

grant insert on table "public"."agents" to "authenticated";

grant references on table "public"."agents" to "authenticated";

grant select on table "public"."agents" to "authenticated";

grant trigger on table "public"."agents" to "authenticated";

grant truncate on table "public"."agents" to "authenticated";

grant update on table "public"."agents" to "authenticated";

grant delete on table "public"."agents" to "service_role";

grant insert on table "public"."agents" to "service_role";

grant references on table "public"."agents" to "service_role";

grant select on table "public"."agents" to "service_role";

grant trigger on table "public"."agents" to "service_role";

grant truncate on table "public"."agents" to "service_role";

grant update on table "public"."agents" to "service_role";

grant delete on table "public"."cause_subscriptions" to "anon";

grant insert on table "public"."cause_subscriptions" to "anon";

grant references on table "public"."cause_subscriptions" to "anon";

grant select on table "public"."cause_subscriptions" to "anon";

grant trigger on table "public"."cause_subscriptions" to "anon";

grant truncate on table "public"."cause_subscriptions" to "anon";

grant update on table "public"."cause_subscriptions" to "anon";

grant delete on table "public"."cause_subscriptions" to "authenticated";

grant insert on table "public"."cause_subscriptions" to "authenticated";

grant references on table "public"."cause_subscriptions" to "authenticated";

grant select on table "public"."cause_subscriptions" to "authenticated";

grant trigger on table "public"."cause_subscriptions" to "authenticated";

grant truncate on table "public"."cause_subscriptions" to "authenticated";

grant update on table "public"."cause_subscriptions" to "authenticated";

grant delete on table "public"."cause_subscriptions" to "service_role";

grant insert on table "public"."cause_subscriptions" to "service_role";

grant references on table "public"."cause_subscriptions" to "service_role";

grant select on table "public"."cause_subscriptions" to "service_role";

grant trigger on table "public"."cause_subscriptions" to "service_role";

grant truncate on table "public"."cause_subscriptions" to "service_role";

grant update on table "public"."cause_subscriptions" to "service_role";

grant delete on table "public"."causes" to "anon";

grant insert on table "public"."causes" to "anon";

grant references on table "public"."causes" to "anon";

grant select on table "public"."causes" to "anon";

grant trigger on table "public"."causes" to "anon";

grant truncate on table "public"."causes" to "anon";

grant update on table "public"."causes" to "anon";

grant delete on table "public"."causes" to "authenticated";

grant insert on table "public"."causes" to "authenticated";

grant references on table "public"."causes" to "authenticated";

grant select on table "public"."causes" to "authenticated";

grant trigger on table "public"."causes" to "authenticated";

grant truncate on table "public"."causes" to "authenticated";

grant update on table "public"."causes" to "authenticated";

grant delete on table "public"."causes" to "service_role";

grant insert on table "public"."causes" to "service_role";

grant references on table "public"."causes" to "service_role";

grant select on table "public"."causes" to "service_role";

grant trigger on table "public"."causes" to "service_role";

grant truncate on table "public"."causes" to "service_role";

grant update on table "public"."causes" to "service_role";

grant delete on table "public"."posts" to "anon";

grant insert on table "public"."posts" to "anon";

grant references on table "public"."posts" to "anon";

grant select on table "public"."posts" to "anon";

grant trigger on table "public"."posts" to "anon";

grant truncate on table "public"."posts" to "anon";

grant update on table "public"."posts" to "anon";

grant delete on table "public"."posts" to "authenticated";

grant insert on table "public"."posts" to "authenticated";

grant references on table "public"."posts" to "authenticated";

grant select on table "public"."posts" to "authenticated";

grant trigger on table "public"."posts" to "authenticated";

grant truncate on table "public"."posts" to "authenticated";

grant update on table "public"."posts" to "authenticated";

grant delete on table "public"."posts" to "service_role";

grant insert on table "public"."posts" to "service_role";

grant references on table "public"."posts" to "service_role";

grant select on table "public"."posts" to "service_role";

grant trigger on table "public"."posts" to "service_role";

grant truncate on table "public"."posts" to "service_role";

grant update on table "public"."posts" to "service_role";

grant delete on table "public"."problems" to "anon";

grant insert on table "public"."problems" to "anon";

grant references on table "public"."problems" to "anon";

grant select on table "public"."problems" to "anon";

grant trigger on table "public"."problems" to "anon";

grant truncate on table "public"."problems" to "anon";

grant update on table "public"."problems" to "anon";

grant delete on table "public"."problems" to "authenticated";

grant insert on table "public"."problems" to "authenticated";

grant references on table "public"."problems" to "authenticated";

grant select on table "public"."problems" to "authenticated";

grant trigger on table "public"."problems" to "authenticated";

grant truncate on table "public"."problems" to "authenticated";

grant update on table "public"."problems" to "authenticated";

grant delete on table "public"."problems" to "service_role";

grant insert on table "public"."problems" to "service_role";

grant references on table "public"."problems" to "service_role";

grant select on table "public"."problems" to "service_role";

grant trigger on table "public"."problems" to "service_role";

grant truncate on table "public"."problems" to "service_role";

grant update on table "public"."problems" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "agents_delete_owner"
  on "public"."agents"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = agents.owner_user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))));



  create policy "agents_insert_owner"
  on "public"."agents"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = agents.owner_user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))));



  create policy "agents_select_owner"
  on "public"."agents"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = agents.owner_user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))));



  create policy "agents_update_owner"
  on "public"."agents"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = agents.owner_user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))))
with check ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = agents.owner_user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))));



  create policy "cause_subscriptions_delete_owner"
  on "public"."cause_subscriptions"
  as permissive
  for delete
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = cause_subscriptions.user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM (public.agents a
     JOIN public.users u ON ((u.id = a.owner_user_id)))
  WHERE ((a.id = cause_subscriptions.agent_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text)))))));



  create policy "cause_subscriptions_insert_owner"
  on "public"."cause_subscriptions"
  as permissive
  for insert
  to authenticated
with check (((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = cause_subscriptions.user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM (public.agents a
     JOIN public.users u ON ((u.id = a.owner_user_id)))
  WHERE ((a.id = cause_subscriptions.agent_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text)))))));



  create policy "cause_subscriptions_select_owner"
  on "public"."cause_subscriptions"
  as permissive
  for select
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = cause_subscriptions.user_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM (public.agents a
     JOIN public.users u ON ((u.id = a.owner_user_id)))
  WHERE ((a.id = cause_subscriptions.agent_id) AND (u.clerk_user_id = (auth.jwt() ->> 'sub'::text)))))));



  create policy "causes_select_public"
  on "public"."causes"
  as permissive
  for select
  to public
using (true);



  create policy "posts_insert_auth"
  on "public"."posts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "posts_select_public"
  on "public"."posts"
  as permissive
  for select
  to public
using (true);



  create policy "posts_update_auth"
  on "public"."posts"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "problems_insert_auth"
  on "public"."problems"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "problems_select_public"
  on "public"."problems"
  as permissive
  for select
  to public
using (true);



  create policy "problems_update_auth"
  on "public"."problems"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "users_insert_own"
  on "public"."users"
  as permissive
  for insert
  to authenticated
with check ((clerk_user_id = (auth.jwt() ->> 'sub'::text)));



  create policy "users_select_own"
  on "public"."users"
  as permissive
  for select
  to authenticated
using ((clerk_user_id = (auth.jwt() ->> 'sub'::text)));



  create policy "users_update_own"
  on "public"."users"
  as permissive
  for update
  to authenticated
using ((clerk_user_id = (auth.jwt() ->> 'sub'::text)))
with check ((clerk_user_id = (auth.jwt() ->> 'sub'::text)));



