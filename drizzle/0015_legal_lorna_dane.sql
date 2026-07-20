CREATE TABLE "escalation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"classification" text,
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escalation_summaries" ADD CONSTRAINT "escalation_summaries_plan_id_intervention_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_plan_id_intervention_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escalation_summaries_plan_id_idx" ON "escalation_summaries" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_reviews_plan_id_idx" ON "plan_reviews" USING btree ("plan_id");