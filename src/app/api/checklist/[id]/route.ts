import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems } from "@/db/schema";
import { checklistUpdateSchema, idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = checklistUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!idSchema.safeParse(id).success || !body.success) {
    return Response.json({ error: "Invalid checklist item" }, { status: 400 });
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
