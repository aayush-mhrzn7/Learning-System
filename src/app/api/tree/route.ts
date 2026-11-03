import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { directories, notes } from "@/db/schema";

export async function GET() {
  const [directoryRows, noteRows] = await Promise.all([
    db
      .select()
      .from(directories)
      .where(isNull(directories.deletedAt))
      .orderBy(asc(directories.name)),
    db
      .select({
        id: notes.id,
        directoryId: notes.directoryId,
        title: notes.title,
        status: notes.status,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(isNull(notes.deletedAt))
      .orderBy(asc(notes.title)),
  ]);

  return Response.json({ directories: directoryRows, notes: noteRows });
}
