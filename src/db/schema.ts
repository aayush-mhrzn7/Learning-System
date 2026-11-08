import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

export type VisualizeDiagram = {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string; label?: string }[];
};

export type VisualizeMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
  /** Present on accepted assistant turns — each question keeps its own diagram. */
  diagram?: VisualizeDiagram | null;
  explanation?: string;
  sampleInput?: string;
  sampleOutput?: string;
  /** Plain-text / ASCII / LaTeX-ish formula when the topic is mathematical. */
  formula?: string;
};

export type VisualizeState = {
  messages: VisualizeMessage[];
};

export const noteStatus = pgEnum("note_status", ["draft", "published"]);
export const noteKind = pgEnum("note_kind", ["writing", "visualize"]);
export const claimVerdict = pgEnum("claim_verdict", [
  "correct",
  "incorrect",
  "unsure",
]);
export const aiProvider = pgEnum("ai_provider", ["gpt", "openrouter"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export const directories = pgTable(
  "directories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("directories_user_idx").on(table.userId),
    index("directories_parent_idx").on(table.parentId),
    index("directories_deleted_idx").on(table.deletedAt),
    index("directories_delete_batch_idx").on(table.deleteBatchId),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    directoryId: uuid("directory_id").references(() => directories.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull().default("Untitled"),
    kind: noteKind("kind").notNull().default("writing"),
    content: jsonb("content")
      .$type<EditorDocument>()
      .notNull()
      .default({ type: "doc", content: [{ type: "paragraph" }] }),
    plainText: text("plain_text").notNull().default(""),
    visualize: jsonb("visualize").$type<VisualizeState | null>().default(null),
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
    index("notes_user_idx").on(table.userId),
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

/** Obsidian-style note↔note edges for the knowledge graph. */
export const noteLinks = pgTable(
  "note_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceNoteId: uuid("source_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    targetNoteId: uuid("target_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("note_links_source_target_idx").on(
      table.sourceNoteId,
      table.targetNoteId,
    ),
    index("note_links_user_idx").on(table.userId),
    index("note_links_source_idx").on(table.sourceNoteId),
    index("note_links_target_idx").on(table.targetNoteId),
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

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    model: text("model").notNull(),
    baseUrl: text("base_url").notNull(),
    /** AES-GCM payload from encryptSecret — never return to the client. */
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_credentials_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
    index("provider_credentials_user_idx").on(table.userId),
  ],
);

/** One row per OpenAI/OpenRouter API call (Responses or Decisions). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    model: text("model").notNull(),
    /** responses | decisions */
    api: text("api").notNull(),
    /** extract | decide | judge | gaps | inline | visualize | reformat */
    task: text("task").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    /** Null when no price map entry for the model. */
    estimatedCostUsd: doublePrecision("estimated_cost_usd"),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_usage_user_idx").on(table.userId),
    index("ai_usage_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Directory = typeof directories.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteLink = typeof noteLinks.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
