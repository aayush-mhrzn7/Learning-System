import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, claims, directories, notes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { syncWikiLinksFromPlainText } from "@/lib/note-links";
import { idSchema, noteUpdateSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const [note] = await db
    .select()
    .from(notes)
    .where(
      and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
    .limit(1);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  // Visualize notes only need title/visualize — skip claims/checklist load.
  if (note.kind === "visualize") {
    return Response.json({ note, claims: [], checklist: [] });
  }

  const [claimRows, checklist] = await Promise.all([
    db
      .select()
      .from(claims)
      .where(eq(claims.noteId, id))
      .orderBy(asc(claims.createdAt)),
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.noteId, id))
      .orderBy(asc(checklistItems.createdAt)),
  ]);
  return Response.json({ note, claims: claimRows, checklist });
}

export async function PATCH(request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  const body = noteUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!idSchema.safeParse(id).success || !body.success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const [current] = await db
    .select({
      status: notes.status,
      title: notes.title,
      content: notes.content,
      plainText: notes.plainText,
    })
    .from(notes)
    .where(
      and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
    .limit(1);
  if (!current) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  if (body.data.directoryId !== undefined && body.data.directoryId !== null) {
    const [directory] = await db
      .select({ id: directories.id })
      .from(directories)
      .where(
        and(
          eq(directories.id, body.data.directoryId),
          eq(directories.userId, userId),
          isNull(directories.deletedAt),
        ),
      )
      .limit(1);
    if (!directory) {
      return Response.json({ error: "Directory not found" }, { status: 404 });
    }
  }

  // Guard against client races that autosave an empty editor over a real note.
  if (
    body.data.plainText !== undefined &&
    current.plainText.trim().length > 20 &&
    body.data.plainText.trim().length === 0
  ) {
    return Response.json(
      { error: "Refusing to overwrite note with empty content" },
      { status: 409 },
    );
  }

  const changed =
    (body.data.title !== undefined && body.data.title !== current.title) ||
    (body.data.plainText !== undefined &&
      body.data.plainText !== current.plainText) ||
    (body.data.content !== undefined &&
      JSON.stringify(body.data.content) !== JSON.stringify(current.content));

  const [note] = await db
    .update(notes)
    .set({
      ...body.data,
      editedSincePublish:
        current.status === "published" && changed ? true : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning();

  if (body.data.plainText !== undefined) {
    await db.execute(sql`
      UPDATE claims
      SET stale = position(lower(claim_text) in lower(${body.data.plainText})) = 0
      WHERE note_id = ${id}::uuid
    `);
    await syncWikiLinksFromPlainText(userId, id, body.data.plainText);
  }

  return Response.json({ note });
}

export async function DELETE(_request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const batchId = crypto.randomUUID();
  const [note] = await db
    .update(notes)
    .set({ deletedAt: new Date(), deleteBatchId: batchId })
    .where(
      and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
    .returning({ id: notes.id });
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  return Response.json({ ok: true, batchId });
}
