import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { noteLinks, notes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { noteLinkCreateSchema, noteLinkDeleteSchema } from "@/lib/schemas";

async function ownedNotes(userId: string, a: string, b: string) {
  const rows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
        or(eq(notes.id, a), eq(notes.id, b)),
      ),
    );
  return rows.length === 2;
}

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const parsed = noteLinkCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid link" }, { status: 400 });
  }

  const { sourceNoteId, targetNoteId } = parsed.data;
  if (!(await ownedNotes(userId, sourceNoteId, targetNoteId))) {
    return Response.json({ error: "Notes not found" }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: noteLinks.id })
    .from(noteLinks)
    .where(
      and(
        eq(noteLinks.userId, userId),
        or(
          and(
            eq(noteLinks.sourceNoteId, sourceNoteId),
            eq(noteLinks.targetNoteId, targetNoteId),
          ),
          and(
            eq(noteLinks.sourceNoteId, targetNoteId),
            eq(noteLinks.targetNoteId, sourceNoteId),
          ),
        ),
      ),
    )
    .limit(1);

  if (existing) {
    return Response.json({
      link: {
        id: existing.id,
        source: sourceNoteId,
        target: targetNoteId,
      },
    });
  }

  const [link] = await db
    .insert(noteLinks)
    .values({
      userId,
      sourceNoteId,
      targetNoteId,
    })
    .returning({
      id: noteLinks.id,
      source: noteLinks.sourceNoteId,
      target: noteLinks.targetNoteId,
    });

  return Response.json({ link }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const parsed = noteLinkDeleteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid link" }, { status: 400 });
  }

  const { sourceNoteId, targetNoteId } = parsed.data;
  await db
    .delete(noteLinks)
    .where(
      and(
        eq(noteLinks.userId, userId),
        or(
          and(
            eq(noteLinks.sourceNoteId, sourceNoteId),
            eq(noteLinks.targetNoteId, targetNoteId),
          ),
          and(
            eq(noteLinks.sourceNoteId, targetNoteId),
            eq(noteLinks.targetNoteId, sourceNoteId),
          ),
        ),
      ),
    );

  return Response.json({ ok: true });
}
