import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, notes } from "@/db/schema";
import { findMissingTopics } from "@/lib/ai";
import { documentToText } from "@/lib/editor-text";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const [note] = await db
    .select({ content: notes.content })
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .limit(1);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const existing = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.noteId, id));
  const noteText = documentToText(note.content, { skipCode: true });

  if (noteText.length < 500) {
    return Response.json({
      checklist: existing,
      skipped: "minimum_length",
      message: "Write at least 500 non-code characters before analyzing gaps.",
    });
  }

  const known = new Set(existing.map((item) => item.text.trim().toLowerCase()));
  const analysis = await findMissingTopics(noteText);

  if (!analysis.eligible) {
    return Response.json({
      checklist: existing,
      skipped: "not_learning_note",
      message: analysis.reason,
    });
  }

  const newItems = analysis.gaps.filter(
    (gap) => !known.has(gap.trim().toLowerCase()),
  );

  if (newItems.length > 0) {
    await db
      .insert(checklistItems)
      .values(newItems.map((text) => ({ noteId: id, text })));
  }

  const checklist = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.noteId, id))
    .orderBy(asc(checklistItems.createdAt));
  return Response.json({
    checklist,
    skipped: null,
    message:
      analysis.gaps.length === 0
        ? "No important conceptual gaps found."
        : null,
  });
}
