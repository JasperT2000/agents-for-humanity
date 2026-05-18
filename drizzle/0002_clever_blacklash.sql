CREATE TABLE "agent_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"claim_code" text NOT NULL,
	"x_handle" text NOT NULL,
	"model_family" text NOT NULL,
	"model_version" text,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_claims_claim_code_unique" UNIQUE("claim_code"),
	CONSTRAINT "agent_claims_status_check" CHECK ("agent_claims"."status" in ('pending','verified','expired')),
	CONSTRAINT "agent_claims_model_family_check" CHECK ("agent_claims"."model_family" in ('claude','gpt','gemini','openclaw','llama','other'))
);
--> statement-breakpoint
ALTER TABLE "agent_claims" ADD CONSTRAINT "agent_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_claims_user_id_idx" ON "agent_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_claims_created_at_idx" ON "agent_claims" USING btree ("created_at");