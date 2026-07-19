CREATE TABLE "evidence_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_id" uuid,
	"topic_key" text NOT NULL,
	"population" text,
	"action" text,
	"dosage" text,
	"comparator" text,
	"outcome" text,
	"study_direction" text,
	"study_type" text,
	"applicable_conditions" text,
	"risk" text,
	"uncertainty" text,
	"published_date" date,
	"source_version" integer NOT NULL,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"conflict_status" text,
	"conflict_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_claims" ADD CONSTRAINT "evidence_claims_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claims" ADD CONSTRAINT "evidence_claims_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_claims_topic_key_idx" ON "evidence_claims" USING btree ("topic_key");--> statement-breakpoint
CREATE INDEX "evidence_claims_source_id_idx" ON "evidence_claims" USING btree ("source_id");