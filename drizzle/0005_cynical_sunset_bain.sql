CREATE TABLE "extracted_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"raw_test_name" text NOT NULL,
	"raw_value" text NOT NULL,
	"raw_unit" text,
	"raw_reference_range" text,
	"confidence" real NOT NULL,
	"page_number" integer NOT NULL,
	"coordinates" jsonb NOT NULL,
	"status" text DEFAULT 'extracted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extracted_items" ADD CONSTRAINT "extracted_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracted_items_document_id_idx" ON "extracted_items" USING btree ("document_id");