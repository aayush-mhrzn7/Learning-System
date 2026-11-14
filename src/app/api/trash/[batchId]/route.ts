import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUserId } from "@/lib/auth";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(_request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { batchId } = await context.params;
  if (!idSchema.safeParse(batchId).success) {
    return Response.json({ error: "Invalid batch" }, { status: 400 });
  }

  await db.execute(sql`
    WITH RECURSIVE restore_roots AS (
      SELECT id, parent_id
      FROM directories
      WHERE delete_batch_id = ${batchId}::uuid
        AND user_id = ${userId}::uuid
      UNION
      SELECT d.id, d.parent_id
      FROM directories d
      JOIN notes n ON n.directory_id = d.id
      WHERE n.delete_batch_id = ${batchId}::uuid
        AND n.user_id = ${userId}::uuid
        AND d.user_id = ${userId}::uuid
    ),
    ancestors AS (
      SELECT id, parent_id FROM restore_roots
      UNION
      SELECT parent.id, parent.parent_id
      FROM directories parent
      JOIN ancestors child ON child.parent_id = parent.id
      WHERE parent.user_id = ${userId}::uuid
    ),
    restored_directories AS (
      UPDATE directories
      SET
        deleted_at = NULL,
        -- Only detach this batch; keep other batches' ids so trash stays consistent.
        delete_batch_id = CASE
          WHEN delete_batch_id = ${batchId}::uuid THEN NULL
          ELSE delete_batch_id
        END
      WHERE id IN (SELECT id FROM ancestors)
        AND user_id = ${userId}::uuid
      RETURNING id
    )
    UPDATE notes
    SET deleted_at = NULL, delete_batch_id = NULL
    WHERE delete_batch_id = ${batchId}::uuid
      AND user_id = ${userId}::uuid
  `);

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { batchId } = await context.params;
  if (!idSchema.safeParse(batchId).success) {
    return Response.json({ error: "Invalid batch" }, { status: 400 });
  }

  await db.execute(sql`
    WITH deleted_notes AS (
      DELETE FROM notes
      WHERE delete_batch_id = ${batchId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NOT NULL
      RETURNING id
    )
    DELETE FROM directories
    WHERE delete_batch_id = ${batchId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NOT NULL
  `);

  return Response.json({ ok: true });
}
