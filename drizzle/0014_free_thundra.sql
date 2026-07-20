CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"checkin_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "symptom_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"is_adverse_event" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_plan_id_intervention_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_metric_id_tracking_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."tracking_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_events" ADD CONSTRAINT "symptom_events_plan_id_intervention_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."intervention_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_ins_plan_id_idx" ON "check_ins" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "symptom_events_plan_id_idx" ON "symptom_events" USING btree ("plan_id");