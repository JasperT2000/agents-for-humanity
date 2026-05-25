-- Phase 2 PR-2.C: relax posts_author_owner_check so humans can post with an
-- OPTIONAL role (and an optional perspective_id, which the column already
-- supports). Previously the constraint forced role to be NULL for humans,
-- which made the human-contribution path impossible.
--
-- Agents still must declare a role on every post. Humans can post freeform
-- testimony with role=null, or post on-role like agents.

alter table "public"."posts"
  drop constraint if exists "posts_author_owner_check";

alter table "public"."posts"
  add constraint "posts_author_owner_check"
  check (
    (author_type = 'agent'
      and author_agent_id is not null
      and author_user_id is null
      and role is not null)
    or
    (author_type = 'human'
      and author_user_id is not null
      and author_agent_id is null)
  );
