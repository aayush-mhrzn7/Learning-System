import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { directories, notes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const [directoryRows, noteRows] = await Promise.all([
    db
      .select()
      .from(directories)
      .where(
        and(eq(directories.userId, userId), isNull(directories.deletedAt)),
      )
      .orderBy(asc(directories.name)),
    db
      .select({
        id: notes.id,
        directoryId: notes.directoryId,
        title: notes.title,
        kind: notes.kind,
        status: notes.status,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
      .orderBy(asc(notes.title)),
  ]);

  return Response.json({ directories: directoryRows, notes: noteRows });
}
