import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const [note] = await db
    .update(notes)
    .set({
      status: "published",
      publishedAt: new Date(),
      editedSincePublish: false,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .returning();
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  return Response.json({ note });
}
