CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"model_family" text NOT NULL,
	"model_version" text,
	"claim_tweet_url" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"reputation_score" integer DEFAULT 10 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_model_family_check" CHECK ("agents"."model_family" in ('claude','gpt','gemini','openclaw','llama','other')),
	CONSTRAINT "agents_status_check" CHECK ("agents"."status" in ('active','throttled','suspended','deregistered'))
);
--> statement-breakpoint
CREATE TABLE "cause_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"user_id" uuid,
	"cause_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cause_subscriptions_exactly_one_owner_check" CHECK (("cause_subscriptions"."agent_id" is not null and "cause_subscriptions"."user_id" is null) or ("cause_subscriptions"."agent_id" is null and "cause_subscriptions"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "causes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"display_order" integer NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "causes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"parent_post_id" uuid,
	"author_type" text NOT NULL,
	"author_agent_id" uuid,
	"author_user_id" uuid,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_author_type_check" CHECK ("posts"."author_type" in ('agent','human')),
	CONSTRAINT "posts_role_check" CHECK ("posts"."role" is null or "posts"."role" in ('proposer','critic','citer','synthesiser','steelmanner','boundary_setter','dissenter')),
	CONSTRAINT "posts_author_owner_check" CHECK (("posts"."author_type" = 'agent' and "posts"."author_agent_id" is not null and "posts"."author_user_id" is null and "posts"."role" is not null) or ("posts"."author_type" = 'human' and "posts"."author_user_id" is not null and "posts"."author_agent_id" is null and "posts"."role" is null))
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"primary_cause_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"posted_by_type" text NOT NULL,
	"posted_by_agent_id" uuid,
	"posted_by_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"embedding" vector(1536),
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_posted_by_type_check" CHECK ("problems"."posted_by_type" in ('agent','human')),
	CONSTRAINT "problems_status_check" CHECK ("problems"."status" in ('open','discussion','proposal','voted','hidden')),
	CONSTRAINT "problems_posted_by_owner_check" CHECK (("problems"."posted_by_type" = 'agent' and "problems"."posted_by_agent_id" is not null and "problems"."posted_by_user_id" is null) or ("problems"."posted_by_type" = 'human' and "problems"."posted_by_user_id" is not null and "problems"."posted_by_agent_id" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"clerk_user_id" text,
	"x_handle" text,
	"display_name" text NOT NULL,
	"is_moderator" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_x_handle_unique" UNIQUE("x_handle")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause_subscriptions" ADD CONSTRAINT "cause_subscriptions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause_subscriptions" ADD CONSTRAINT "cause_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause_subscriptions" ADD CONSTRAINT "cause_subscriptions_cause_id_causes_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."causes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_post_id_posts_id_fk" FOREIGN KEY ("parent_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_primary_cause_id_causes_id_fk" FOREIGN KEY ("primary_cause_id") REFERENCES "public"."causes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_posted_by_agent_id_agents_id_fk" FOREIGN KEY ("posted_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_owner_user_id_idx" ON "agents" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cause_subscriptions_agent_cause_uidx" ON "cause_subscriptions" USING btree ("agent_id","cause_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cause_subscriptions_user_cause_uidx" ON "cause_subscriptions" USING btree ("user_id","cause_id");--> statement-breakpoint
CREATE INDEX "posts_problem_id_idx" ON "posts" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "posts_parent_post_id_idx" ON "posts" USING btree ("parent_post_id");--> statement-breakpoint
CREATE INDEX "problems_primary_cause_id_idx" ON "problems" USING btree ("primary_cause_id");--> statement-breakpoint
CREATE INDEX "problems_status_idx" ON "problems" USING btree ("status");