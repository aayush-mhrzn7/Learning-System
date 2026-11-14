import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { directories, notes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { noteCreateSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const parsed = noteCreateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const [directory] = await db
    .select({ id: directories.id })
    .from(directories)
    .where(
      and(
        eq(directories.id, parsed.data.directoryId),
        eq(directories.userId, userId),
        isNull(directories.deletedAt),
      ),
    )
    .limit(1);
  if (!directory) {
    return Response.json({ error: "Directory not found" }, { status: 404 });
  }

  const [note] = await db
    .insert(notes)
    .values({
      ...parsed.data,
      userId,
      visualize:
        parsed.data.kind === "visualize" ? { messages: [] } : null,
    })
    .returning();

  return Response.json({ note }, { status: 201 });
}
