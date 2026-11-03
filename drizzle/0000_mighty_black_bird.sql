CREATE TYPE "public"."claim_verdict" AS ENUM('correct', 'incorrect', 'unsure');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"text" text NOT NULL,
	"ticked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"claim_text" text NOT NULL,
	"verdict" "claim_verdict" NOT NULL,
	"reason" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"deleted_at" timestamp with time zone,
	"delete_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"directory_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content" jsonb DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"status" "note_status" DEFAULT 'draft' NOT NULL,
	"edited_since_publish" boolean DEFAULT false NOT NULL,
	"fact_check_incomplete" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"delete_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directories" ADD CONSTRAINT "directories_parent_id_directories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."directories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_directory_id_directories_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."directories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_note_idx" ON "checklist_items" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "claims_note_idx" ON "claims" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "directories_parent_idx" ON "directories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "directories_deleted_idx" ON "directories" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "directories_delete_batch_idx" ON "directories" USING btree ("delete_batch_id");--> statement-breakpoint
CREATE INDEX "notes_directory_idx" ON "notes" USING btree ("directory_id");--> statement-breakpoint
CREATE INDEX "notes_deleted_idx" ON "notes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notes_delete_batch_idx" ON "notes" USING btree ("delete_batch_id");--> statement-breakpoint
CREATE INDEX "notes_updated_idx" ON "notes" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "notes_search_idx" ON "notes" USING gin ((
        setweight(to_tsvector('english', "title"), 'A') ||
        setweight(to_tsvector('english', "plain_text"), 'B')
      ));