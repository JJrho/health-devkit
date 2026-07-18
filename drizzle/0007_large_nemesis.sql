CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"extracted_item_id" uuid NOT NULL,
	"test_definition_id" uuid NOT NULL,
	"numeric_value" numeric NOT NULL,
	"unit" text NOT NULL,
	"raw_value" text NOT NULL,
	"raw_unit" text,
	"page_number" integer NOT NULL,
	"coordinates" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_definition_id" uuid NOT NULL,
	"alias_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_definition_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_definition_id" uuid NOT NULL,
	"unit_text" text NOT NULL,
	"factor_to_canonical" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"canonical_unit" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_extracted_item_id_extracted_items_id_fk" FOREIGN KEY ("extracted_item_id") REFERENCES "public"."extracted_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_test_definition_id_test_definitions_id_fk" FOREIGN KEY ("test_definition_id") REFERENCES "public"."test_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_aliases" ADD CONSTRAINT "test_aliases_test_definition_id_test_definitions_id_fk" FOREIGN KEY ("test_definition_id") REFERENCES "public"."test_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_definition_units" ADD CONSTRAINT "test_definition_units_test_definition_id_test_definitions_id_fk" FOREIGN KEY ("test_definition_id") REFERENCES "public"."test_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "observations_project_id_idx" ON "observations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "observations_extracted_item_id_idx" ON "observations" USING btree ("extracted_item_id");--> statement-breakpoint
CREATE INDEX "test_aliases_alias_text_idx" ON "test_aliases" USING btree ("alias_text");