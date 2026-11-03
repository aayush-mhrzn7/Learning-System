import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { directories, notes } from "@/db/schema";
import { noteCreateSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  const directoryId = new URL(request.url).searchParams.get("directoryId");
  const rows = await db
    .select()
    .from(notes)
    .where(
      directoryId
        ? and(eq(notes.directoryId, directoryId), isNull(notes.deletedAt))
        : isNull(notes.deletedAt),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(100);
  return Response.json({ notes: rows });
}

export async function POST(request: Request) {
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
        isNull(directories.deletedAt),
      ),
    )
    .limit(1);
  if (!directory) {
    return Response.json({ error: "Directory not found" }, { status: 404 });
  }

  const [note] = await db
    .insert(notes)
    .values(parsed.data)
    .returning();

  return Response.json({ note }, { status: 201 });
}
