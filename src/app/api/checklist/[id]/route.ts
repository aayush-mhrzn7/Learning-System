import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, notes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { checklistUpdateSchema, idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  const body = checklistUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!idSchema.safeParse(id).success || !body.success) {
    return Response.json({ error: "Invalid checklist item" }, { status: 400 });
  }

  const [owned] = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .where(
      and(
        eq(checklistItems.id, id),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);
  if (!owned) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  const [item] = await db
    .update(checklistItems)
    .set({ ticked: body.data.ticked })
    .where(eq(checklistItems.id, id))
    .returning();
  if (!item) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ item });
}

export async function DELETE(_request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid checklist item" }, { status: 400 });
  }

  const [owned] = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .where(
      and(
        eq(checklistItems.id, id),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);
  if (!owned) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  const [item] = await db
    .delete(checklistItems)
    .where(eq(checklistItems.id, id))
    .returning();
  if (!item) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ item });
}
