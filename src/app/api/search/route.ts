import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUserId } from "@/lib/auth";
import { searchSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const parsed = searchSchema.safeParse({
    q: new URL(request.url).searchParams.get("q"),
  });
  if (!parsed.success) {
    return Response.json({ results: [] });
  }

  const result = await db.execute<{
    id: string;
    title: string;
    path: string;
    snippet: string;
    rank: number;
  }>(sql`
    WITH RECURSIVE directory_paths AS (
      SELECT id, parent_id, name::text AS path
      FROM directories
      WHERE parent_id IS NULL
        AND deleted_at IS NULL
        AND user_id = ${userId}::uuid
      UNION ALL
      SELECT child.id, child.parent_id, (parent.path || ' / ' || child.name)::text
      FROM directories child
      JOIN directory_paths parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
        AND child.user_id = ${userId}::uuid
    ),
    query AS (
      SELECT websearch_to_tsquery('english', ${parsed.data.q}) AS value
    )
    SELECT
      n.id,
      n.title,
      directory_paths.path,
      ts_headline(
        'english',
        n.plain_text,
        query.value,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8'
      ) AS snippet,
      ts_rank_cd(
        setweight(to_tsvector('english', n.title), 'A') ||
        setweight(to_tsvector('english', n.plain_text), 'B'),
        query.value
      ) AS rank
    FROM notes n
    JOIN directory_paths ON directory_paths.id = n.directory_id
    CROSS JOIN query
    WHERE n.deleted_at IS NULL
      AND n.user_id = ${userId}::uuid
      AND (
        setweight(to_tsvector('english', n.title), 'A') ||
        setweight(to_tsvector('english', n.plain_text), 'B')
      ) @@ query.value
    ORDER BY rank DESC, n.updated_at DESC
    LIMIT 30
  `);

  return Response.json({ results: result.rows });
}
