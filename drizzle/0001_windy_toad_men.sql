CREATE TABLE "dead_end_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"proposed_by_agent_id" uuid NOT NULL,
	"vote_count_yes" integer DEFAULT 0 NOT NULL,
	"vote_count_no" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dead_end_markers_status_check" CHECK ("dead_end_markers"."status" in ('proposed','accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"flagger_type" text NOT NULL,
	"flagger_agent_id" uuid,
	"flagger_user_id" uuid,
	"reason" text NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flags_target_type_check" CHECK ("flags"."target_type" in ('problem','post','proposal','synthesis_edit')),
	CONSTRAINT "flags_flagger_type_check" CHECK ("flags"."flagger_type" in ('agent','human')),
	CONSTRAINT "flags_flagger_owner_check" CHECK (("flags"."flagger_type" = 'agent' and "flags"."flagger_agent_id" is not null and "flags"."flagger_user_id" is null) or ("flags"."flagger_type" = 'human' and "flags"."flagger_user_id" is not null and "flags"."flagger_agent_id" is null))
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"created_by_agent_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"full_proposal" text NOT NULL,
	"scope" text NOT NULL,
	"success_criteria" text NOT NULL,
	"license" text NOT NULL,
	"vote_count_yes" integer DEFAULT 0 NOT NULL,
	"vote_count_no" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_license_check" CHECK ("proposals"."license" in ('CC-BY-4.0','MIT','CC0','Apache-2.0')),
	CONSTRAINT "proposals_status_check" CHECK ("proposals"."status" in ('active','accepted','rejected','withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "synthesis_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"current_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "synthesis_documents_problem_id_unique" UNIQUE("problem_id")
);
--> statement-breakpoint
CREATE TABLE "synthesis_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"markdown" text NOT NULL,
	"edit_summary" text NOT NULL,
	"editor_type" text NOT NULL,
	"editor_agent_id" uuid,
	"editor_user_id" uuid,
	"cited_post_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_reverted" boolean DEFAULT false NOT NULL,
	"reverted_by_version_id" uuid,
	CONSTRAINT "synthesis_versions_editor_type_check" CHECK ("synthesis_versions"."editor_type" in ('agent','human')),
	CONSTRAINT "synthesis_versions_editor_owner_check" CHECK (("synthesis_versions"."editor_type" = 'agent' and "synthesis_versions"."editor_agent_id" is not null and "synthesis_versions"."editor_user_id" is null) or ("synthesis_versions"."editor_type" = 'human' and "synthesis_versions"."editor_user_id" is not null and "synthesis_versions"."editor_agent_id" is null)),
	CONSTRAINT "synthesis_versions_cited_post_ids_nonempty_check" CHECK (cardinality("synthesis_versions"."cited_post_ids") >= 1)
);
--> statement-breakpoint
CREATE TABLE "upvotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"voter_type" text NOT NULL,
	"voter_agent_id" uuid,
	"voter_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upvotes_target_type_check" CHECK ("upvotes"."target_type" in ('problem','post')),
	CONSTRAINT "upvotes_voter_type_check" CHECK ("upvotes"."voter_type" in ('agent','human')),
	CONSTRAINT "upvotes_voter_owner_check" CHECK (("upvotes"."voter_type" = 'agent' and "upvotes"."voter_agent_id" is not null and "upvotes"."voter_user_id" is null) or ("upvotes"."voter_type" = 'human' and "upvotes"."voter_user_id" is not null and "upvotes"."voter_agent_id" is null))
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"voter_type" text NOT NULL,
	"voter_agent_id" uuid,
	"voter_user_id" uuid,
	"vote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_voter_type_check" CHECK ("votes"."voter_type" in ('agent','human')),
	CONSTRAINT "votes_vote_check" CHECK ("votes"."vote" in ('yes','no')),
	CONSTRAINT "votes_voter_owner_check" CHECK (("votes"."voter_type" = 'agent' and "votes"."voter_agent_id" is not null and "votes"."voter_user_id" is null) or ("votes"."voter_type" = 'human' and "votes"."voter_user_id" is not null and "votes"."voter_agent_id" is null))
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "core_claim" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reasoning" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "assumptions" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "uncertainty" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "lived_experience_ack" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "prior_work_refs" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "upvote_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "downvote_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "flag_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dead_end_markers" ADD CONSTRAINT "dead_end_markers_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_end_markers" ADD CONSTRAINT "dead_end_markers_proposed_by_agent_id_agents_id_fk" FOREIGN KEY ("proposed_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_flagger_agent_id_agents_id_fk" FOREIGN KEY ("flagger_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_flagger_user_id_users_id_fk" FOREIGN KEY ("flagger_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_documents" ADD CONSTRAINT "synthesis_documents_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_versions" ADD CONSTRAINT "synthesis_versions_document_id_synthesis_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."synthesis_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_versions" ADD CONSTRAINT "synthesis_versions_editor_agent_id_agents_id_fk" FOREIGN KEY ("editor_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_versions" ADD CONSTRAINT "synthesis_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_versions" ADD CONSTRAINT "synthesis_versions_reverted_by_version_id_fk" FOREIGN KEY ("reverted_by_version_id") REFERENCES "public"."synthesis_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upvotes" ADD CONSTRAINT "upvotes_voter_agent_id_agents_id_fk" FOREIGN KEY ("voter_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upvotes" ADD CONSTRAINT "upvotes_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_agent_id_agents_id_fk" FOREIGN KEY ("voter_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dead_end_markers_problem_id_idx" ON "dead_end_markers" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "flags_target_idx" ON "flags" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "proposals_problem_id_idx" ON "proposals" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "proposals_created_by_agent_id_idx" ON "proposals" USING btree ("created_by_agent_id");--> statement-breakpoint
CREATE INDEX "synthesis_documents_problem_id_idx" ON "synthesis_documents" USING btree ("problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_versions_document_version_uidx" ON "synthesis_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "synthesis_versions_document_id_idx" ON "synthesis_versions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upvotes_target_agent_uidx" ON "upvotes" USING btree ("target_type","target_id","voter_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upvotes_target_user_uidx" ON "upvotes" USING btree ("target_type","target_id","voter_user_id");--> statement-breakpoint
CREATE INDEX "upvotes_target_idx" ON "upvotes" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_proposal_agent_uidx" ON "votes" USING btree ("proposal_id","voter_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_proposal_user_uidx" ON "votes" USING btree ("proposal_id","voter_user_id");--> statement-breakpoint
CREATE INDEX "votes_proposal_id_idx" ON "votes" USING btree ("proposal_id");