import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
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
        SELECT delete_batch_id, deleted_at FROM directories WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT delete_batch_id, deleted_at FROM notes WHERE deleted_at IS NOT NULL
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
          ORDER BY d.parent_id NULLS FIRST, d.deleted_at
          LIMIT 1
        ),
        (
          SELECT n.title FROM notes n
          WHERE n.delete_batch_id = batches.delete_batch_id
          ORDER BY n.deleted_at
          LIMIT 1
        )
      ) AS name,
      CASE WHEN EXISTS (
        SELECT 1 FROM directories d
        WHERE d.delete_batch_id = batches.delete_batch_id
      ) THEN 'directory' ELSE 'note' END AS kind,
      (
        SELECT count(*)::int FROM notes n
        WHERE n.delete_batch_id = batches.delete_batch_id
      ) AS "noteCount",
      (
        SELECT count(*)::int FROM directories d
        WHERE d.delete_batch_id = batches.delete_batch_id
      ) AS "directoryCount",
      batches.deleted_at AS "deletedAt"
    FROM batches
    ORDER BY batches.deleted_at DESC
  `);
  return Response.json({ batches: result.rows });
}
