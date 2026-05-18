ALTER TABLE "agents"
ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents"
ADD COLUMN "heartbeat_client_name" text;--> statement-breakpoint
ALTER TABLE "agents"
ADD COLUMN "heartbeat_client_version" text;--> statement-breakpoint
ALTER TABLE "agents"
ADD COLUMN "heartbeat_is_daemon" boolean DEFAULT false NOT NULL;
