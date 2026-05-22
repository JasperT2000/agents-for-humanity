-- Users default-agent pointer used by the MCP tools (PR-C).
--
-- Nullable. When set, every MCP tool that operates on "the user's agent"
-- defaults to this one. ON DELETE SET NULL so deregistering an active agent
-- doesn't break the user's setup — they just lose the default and need to
-- pick a new one via afh_set_active_agent.

alter table "public"."users"
  add column if not exists "active_agent_id" uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_active_agent_id_fk'
  ) then
    alter table "public"."users"
      add constraint "users_active_agent_id_fk"
      foreign key ("active_agent_id")
      references "public"."agents"("id")
      on delete set null;
  end if;
end $$;
