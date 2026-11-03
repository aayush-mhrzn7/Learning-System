import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { directories } from "@/db/schema";
import { directoryCreateSchema } from "@/lib/schemas";

export async function GET() {
  const rows = await db
    .select()
    .from(directories)
    .where(isNull(directories.deletedAt))
    .orderBy(asc(directories.name));
  return Response.json({ directories: rows });
}

export async function POST(request: Request) {
  const parsed = directoryCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid directory" }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const [parent] = await db
      .select({ id: directories.id })
      .from(directories)
      .where(
        and(
          eq(directories.id, parsed.data.parentId),
          isNull(directories.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) {
      return Response.json({ error: "Parent not found" }, { status: 404 });
    }
  }

  const [directory] = await db
    .insert(directories)
    .values({
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    })
    .returning();
  return Response.json({ directory }, { status: 201 });
}
