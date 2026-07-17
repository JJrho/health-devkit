CREATE TABLE "extracted_item_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extracted_item_id" uuid NOT NULL,
	"previous_raw_test_name" text NOT NULL,
	"previous_raw_value" text NOT NULL,
	"previous_raw_unit" text,
	"previous_raw_reference_range" text,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extracted_item_edits" ADD CONSTRAINT "extracted_item_edits_extracted_item_id_extracted_items_id_fk" FOREIGN KEY ("extracted_item_id") REFERENCES "public"."extracted_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracted_item_edits_extracted_item_id_idx" ON "extracted_item_edits" USING btree ("extracted_item_id");