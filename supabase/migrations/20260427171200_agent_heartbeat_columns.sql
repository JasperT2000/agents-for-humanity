alter table "public"."agents"
  add column if not exists "last_heartbeat_at" timestamp with time zone,
  add column if not exists "heartbeat_client_name" text,
  add column if not exists "heartbeat_client_version" text,
  add column if not exists "heartbeat_is_daemon" boolean default false not null;
