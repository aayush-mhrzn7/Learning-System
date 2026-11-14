import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUserId } from "@/lib/auth";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const result = await db.execute<{
    batchId: string;
    name: string;
    kind: "directory" | "note";
    noteCount: number;
    directoryCount: number;
    deletedAt: string;
  }>(sql`
    WITH batches AS (
      SELECT delete_batch_id, min(deleted_at) AS deleted_at
      FROM (
        SELECT delete_batch_id, deleted_at FROM directories
        WHERE deleted_at IS NOT NULL AND user_id = ${userId}::uuid
        UNION ALL
        SELECT delete_batch_id, deleted_at FROM notes
        WHERE deleted_at IS NOT NULL AND user_id = ${userId}::uuid
      ) deleted
      WHERE delete_batch_id IS NOT NULL
      GROUP BY delete_batch_id
    )
    SELECT
      batches.delete_batch_id AS "batchId",
      COALESCE(
        (
          SELECT d.name FROM directories d
          WHERE d.delete_batch_id = batches.delete_batch_id
            AND d.user_id = ${userId}::uuid
          ORDER BY d.parent_id NULLS FIRST, d.deleted_at
          LIMIT 1
        ),
        (
          SELECT n.title FROM notes n
          WHERE n.delete_batch_id = batches.delete_batch_id
            AND n.user_id = ${userId}::uuid
          ORDER BY n.deleted_at
          LIMIT 1
        )
      ) AS name,
      CASE WHEN EXISTS (
        SELECT 1 FROM directories d
        WHERE d.delete_batch_id = batches.delete_batch_id
          AND d.user_id = ${userId}::uuid
      ) THEN 'directory' ELSE 'note' END AS kind,
      (
        SELECT count(*)::int FROM notes n
        WHERE n.delete_batch_id = batches.delete_batch_id
          AND n.user_id = ${userId}::uuid
      ) AS "noteCount",
      (
        SELECT count(*)::int FROM directories d
        WHERE d.delete_batch_id = batches.delete_batch_id
          AND d.user_id = ${userId}::uuid
      ) AS "directoryCount",
      batches.deleted_at AS "deletedAt"
    FROM batches
    ORDER BY batches.deleted_at DESC
  `);
  return Response.json({ batches: result.rows });
}

export async function POST() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  await db.execute(sql`
    WITH restored_directories AS (
      UPDATE directories
      SET deleted_at = NULL, delete_batch_id = NULL
      WHERE deleted_at IS NOT NULL AND user_id = ${userId}::uuid
      RETURNING id
    )
    UPDATE notes
    SET deleted_at = NULL, delete_batch_id = NULL
    WHERE deleted_at IS NOT NULL AND user_id = ${userId}::uuid
  `);

  return Response.json({ ok: true });
}

export async function DELETE() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  await db.execute(sql`
    WITH deleted_notes AS (
      DELETE FROM notes
      WHERE deleted_at IS NOT NULL AND user_id = ${userId}::uuid
      RETURNING id
    )
    DELETE FROM directories
    WHERE deleted_at IS NOT NULL AND user_id = ${userId}::uuid
  `);

  return Response.json({ ok: true });
}
