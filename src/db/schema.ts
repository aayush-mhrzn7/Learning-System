import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type EditorDocument = {
  type: "doc";
  content?: Array<Record<string, unknown>>;
};

export type ClaimSource = {
  title: string;
  url: string;
};

export const noteStatus = pgEnum("note_status", ["draft", "published"]);
export const claimVerdict = pgEnum("claim_verdict", [
  "correct",
  "incorrect",
  "unsure",
]);

export const directories = pgTable(
  "directories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => directories.id,
      { onDelete: "cascade" },
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteBatchId: uuid("delete_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("directories_parent_idx").on(table.parentId),
    index("directories_deleted_idx").on(table.deletedAt),
    index("directories_delete_batch_idx").on(table.deleteBatchId),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    directoryId: uuid("directory_id")
      .notNull()
      .references(() => directories.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    content: jsonb("content")
      .$type<EditorDocument>()
      .notNull()
      .default({ type: "doc", content: [{ type: "paragraph" }] }),
    plainText: text("plain_text").notNull().default(""),
    status: noteStatus("status").notNull().default("draft"),
    editedSincePublish: boolean("edited_since_publish")
      .notNull()
      .default(false),
    factCheckIncomplete: boolean("fact_check_incomplete")
      .notNull()
      .default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteBatchId: uuid("delete_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_directory_idx").on(table.directoryId),
    index("notes_deleted_idx").on(table.deletedAt),
    index("notes_delete_batch_idx").on(table.deleteBatchId),
    index("notes_updated_idx").on(table.updatedAt),
    index("notes_search_idx").using(
      "gin",
      sql`(
        setweight(to_tsvector('english', ${table.title}), 'A') ||
        setweight(to_tsvector('english', ${table.plainText}), 'B')
      )`,
    ),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    claimText: text("claim_text").notNull(),
    verdict: claimVerdict("verdict").notNull(),
    reason: text("reason").notNull(),
    sources: jsonb("sources").$type<ClaimSource[]>().notNull().default([]),
    stale: boolean("stale").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("claims_note_idx").on(table.noteId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    ticked: boolean("ticked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("checklist_note_idx").on(table.noteId)],
);

export type Directory = typeof directories.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
