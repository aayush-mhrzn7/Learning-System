import { sql } from "drizzle-orm";
import { db } from "@/db";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(_request: Request, context: Context) {
  const { batchId } = await context.params;
  if (!idSchema.safeParse(batchId).success) {
    return Response.json({ error: "Invalid batch" }, { status: 400 });
  }

  await db.execute(sql`
    WITH RECURSIVE restore_roots AS (
      SELECT id, parent_id
      FROM directories
      WHERE delete_batch_id = ${batchId}::uuid
      UNION
      SELECT d.id, d.parent_id
      FROM directories d
      JOIN notes n ON n.directory_id = d.id
      WHERE n.delete_batch_id = ${batchId}::uuid
    ),
    ancestors AS (
      SELECT id, parent_id FROM restore_roots
      UNION
      SELECT parent.id, parent.parent_id
      FROM directories parent
      JOIN ancestors child ON child.parent_id = parent.id
    ),
    restored_directories AS (
      UPDATE directories
      SET deleted_at = NULL, delete_batch_id = NULL
      WHERE id IN (SELECT id FROM ancestors)
      RETURNING id
    )
    UPDATE notes
    SET deleted_at = NULL, delete_batch_id = NULL
    WHERE delete_batch_id = ${batchId}::uuid
  `);

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const { batchId } = await context.params;
  if (!idSchema.safeParse(batchId).success) {
    return Response.json({ error: "Invalid batch" }, { status: 400 });
  }

  await db.execute(sql`
    WITH deleted_notes AS (
      DELETE FROM notes
      WHERE delete_batch_id = ${batchId}::uuid
      RETURNING id
    )
    DELETE FROM directories
    WHERE delete_batch_id = ${batchId}::uuid
  `);

  return Response.json({ ok: true });
}
