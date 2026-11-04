import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { directories, notes } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

const ROOT_ID = "root";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const [directoryRows, noteRows] = await Promise.all([
    db
      .select({
        id: directories.id,
        name: directories.name,
        parentId: directories.parentId,
      })
      .from(directories)
      .where(and(eq(directories.userId, userId), isNull(directories.deletedAt))),
    db
      .select({
        id: notes.id,
        title: notes.title,
        kind: notes.kind,
        directoryId: notes.directoryId,
      })
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.deletedAt))),
  ]);

  const directoryIds = new Set(directoryRows.map((directory) => directory.id));

  const nodes = [
    { id: ROOT_ID, type: "root" as const, title: "Library", kind: null },
    ...directoryRows.map((directory) => ({
      id: directory.id,
      type: "directory" as const,
      title: directory.name,
      kind: null,
    })),
    ...noteRows
      .filter((note) => directoryIds.has(note.directoryId))
      .map((note) => ({
        id: note.id,
        type: "note" as const,
        title: note.title,
        kind: note.kind,
        directoryId: note.directoryId,
      })),
  ];

  const edges: { id: string; source: string; target: string }[] = [];

  for (const directory of directoryRows) {
    const parent =
      directory.parentId && directoryIds.has(directory.parentId)
        ? directory.parentId
        : ROOT_ID;
    edges.push({
      id: `dir:${directory.id}`,
      source: parent,
      target: directory.id,
    });
  }

  for (const note of noteRows) {
    if (!directoryIds.has(note.directoryId)) continue;
    edges.push({
      id: `note:${note.id}`,
      source: note.directoryId,
      target: note.id,
    });
  }

  return Response.json({ nodes, edges });
}
