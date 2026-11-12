import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { noteLinks, notes } from "@/db/schema";

const WIKI_LINK_RE = /\[\[([^\[\]]+)\]\]/g;

export function extractWikiLinkTitles(plainText: string) {
  const titles = new Set<string>();
  for (const match of plainText.matchAll(WIKI_LINK_RE)) {
    const title = match[1]?.trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

/**
 * Upsert outgoing links from [[Wiki Title]] mentions in a note's plain text.
 * Resolves titles case-insensitively among the user's non-deleted notes.
 */
export async function syncWikiLinksFromPlainText(
  userId: string,
  sourceNoteId: string,
  plainText: string,
) {
  // Most autosaves have no wiki links — skip the candidate-note scan.
  if (!plainText.includes("[[")) return;
  const titles = extractWikiLinkTitles(plainText);
  if (titles.length === 0) return;

  const wanted = new Set(titles.map((title) => title.toLowerCase()));
  const candidates = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
        ne(notes.id, sourceNoteId),
      ),
    );

  const targetIds = candidates
    .filter((note) => wanted.has(note.title.trim().toLowerCase()))
    .map((note) => note.id);
  if (targetIds.length === 0) return;

  const existing = await db
    .select({
      source: noteLinks.sourceNoteId,
      target: noteLinks.targetNoteId,
    })
    .from(noteLinks)
    .where(
      and(
        eq(noteLinks.userId, userId),
        or(
          and(
            eq(noteLinks.sourceNoteId, sourceNoteId),
            inArray(noteLinks.targetNoteId, targetIds),
          ),
          and(
            eq(noteLinks.targetNoteId, sourceNoteId),
            inArray(noteLinks.sourceNoteId, targetIds),
          ),
        ),
      ),
    );

  const linked = new Set(
    existing.flatMap((row) =>
      row.source === sourceNoteId ? [row.target] : [row.source],
    ),
  );

  const missing = targetIds.filter((id) => !linked.has(id));
  if (missing.length === 0) return;

  await db.insert(noteLinks).values(
    missing.map((targetNoteId) => ({
      userId,
      sourceNoteId,
      targetNoteId,
    })),
  );
}
