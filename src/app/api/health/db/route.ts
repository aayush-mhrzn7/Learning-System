import { sql } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";

export async function GET() {
  const { error } = await requireUserId();
  if (error) return error;

  try {
    const result = await db.execute<{ now: string }>(sql`select now() as now`);
    const rows = Array.isArray(result) ? result : result.rows;
    const now = rows[0]?.now ?? null;

    return Response.json({
      ok: true,
      engine: "neon",
      orm: "drizzle",
      now,
    });
  } catch {
    return Response.json(
      {
        ok: false,
        engine: "neon",
        orm: "drizzle",
        error: "Database unavailable",
      },
      { status: 503 },
    );
  }
}
