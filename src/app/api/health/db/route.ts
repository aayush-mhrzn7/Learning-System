import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database unavailable";

    return Response.json(
      {
        ok: false,
        engine: "neon",
        orm: "drizzle",
        error: message,
      },
      { status: 503 },
    );
  }
}
