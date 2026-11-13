import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { directories } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import {
  directoryDeleteMatchSchema,
  directoryUpdateSchema,
  idSchema,
} from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  const body = directoryUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!idSchema.safeParse(id).success || !body.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: directories.id })
    .from(directories)
    .where(
      and(
        eq(directories.id, id),
        eq(directories.userId, userId),
        isNull(directories.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) {
    return Response.json({ error: "Directory not found" }, { status: 404 });
  }

  if (body.data.parentId !== undefined && body.data.parentId !== null) {
    if (body.data.parentId === id) {
      return Response.json(
        { error: "Cannot move a directory into itself" },
        { status: 400 },
      );
    }

    const [parent] = await db
      .select({ id: directories.id, parentId: directories.parentId })
      .from(directories)
      .where(
        and(
          eq(directories.id, body.data.parentId),
          eq(directories.userId, userId),
          isNull(directories.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) {
      return Response.json({ error: "Parent not found" }, { status: 404 });
    }

    // Walk up from the new parent — reject if we hit the moved directory.
    let cursor: string | null = parent.parentId;
    while (cursor) {
      if (cursor === id) {
        return Response.json(
          { error: "Cannot move a directory into its descendant" },
          { status: 400 },
        );
      }
      const [ancestor] = await db
        .select({ parentId: directories.parentId })
        .from(directories)
        .where(
          and(
            eq(directories.id, cursor),
            eq(directories.userId, userId),
            isNull(directories.deletedAt),
          ),
        )
        .limit(1);
      cursor = ancestor?.parentId ?? null;
    }
  }

  const [directory] = await db
    .update(directories)
    .set({
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.parentId !== undefined
        ? { parentId: body.data.parentId }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(directories.id, id),
        eq(directories.userId, userId),
        isNull(directories.deletedAt),
      ),
    )
    .returning();
  if (!directory) {
    return Response.json({ error: "Directory not found" }, { status: 404 });
  }
  return Response.json({ directory });
}

export async function DELETE(request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid directory" }, { status: 400 });
  }

  const [directory] = await db
    .select({ id: directories.id, name: directories.name })
    .from(directories)
    .where(
      and(
        eq(directories.id, id),
        eq(directories.userId, userId),
        isNull(directories.deletedAt),
      ),
    )
    .limit(1);

  if (!directory) {
    return Response.json({ error: "Directory not found" }, { status: 404 });
  }

  const body = directoryDeleteMatchSchema(directory.name).safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return Response.json(
      {
        error: "Confirmation failed",
        issues: body.error.flatten(),
      },
      { status: 400 },
    );
  }

  const batchId = crypto.randomUUID();
  const result = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM directories
      WHERE id = ${id}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
      UNION ALL
      SELECT child.id
      FROM directories child
      JOIN subtree parent ON child.parent_id = parent.id
      WHERE child.user_id = ${userId}::uuid
        AND child.deleted_at IS NULL
    ),
    trashed_directories AS (
      UPDATE directories
      SET deleted_at = now(), delete_batch_id = ${batchId}::uuid
      WHERE id IN (SELECT id FROM subtree)
      RETURNING id
    )
    UPDATE notes
    SET deleted_at = now(), delete_batch_id = ${batchId}::uuid
    WHERE directory_id IN (SELECT id FROM subtree)
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
    RETURNING id
  `);

  return Response.json({ ok: true, batchId, affectedNotes: result.rowCount });
}
