CREATE TABLE "intervention_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "intervention_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"baseline" text,
	"risk_note" text,
	"stop_condition" text,
	"referral_condition" text,
	"review_date" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"stop_reason" text,
	"previous_version_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tracking_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "intervention_actions" ADD CONSTRAINT "intervention_actions_plan_id_intervention_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_plans" ADD CONSTRAINT "intervention_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_plans" ADD CONSTRAINT "intervention_plans_previous_version_id_intervention_plans_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_metrics" ADD CONSTRAINT "tracking_metrics_plan_id_intervention_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intervention_actions_plan_id_idx" ON "intervention_actions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "intervention_plans_project_id_idx" ON "intervention_plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tracking_metrics_plan_id_idx" ON "tracking_metrics" USING btree ("plan_id");