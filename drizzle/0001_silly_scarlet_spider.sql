CREATE TYPE "public"."note_kind" AS ENUM('writing', 'visualize');--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "kind" "note_kind" DEFAULT 'writing' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "visualize" jsonb DEFAULT 'null'::jsonb;
