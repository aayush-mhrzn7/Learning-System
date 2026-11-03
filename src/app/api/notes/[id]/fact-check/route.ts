import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { claims, notes } from "@/db/schema";
import { extractClaims, judgeClaim } from "@/lib/ai";
import { documentToText } from "@/lib/editor-text";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  const [note] = await db
    .select({ content: notes.content })
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .limit(1);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        await db
          .update(notes)
          .set({ factCheckIncomplete: true })
          .where(eq(notes.id, id));

        const noteText = documentToText(note.content, { skipCode: true });
        const extracted = await extractClaims(noteText);
        await db.delete(claims).where(eq(claims.noteId, id));
        send({ type: "start", total: extracted.length });

        let failed = 0;
        await Promise.all(
          extracted.map(async ({ text }) => {
            try {
              const verdict = await judgeClaim(text);
              const [claim] = await db
                .insert(claims)
                .values({
                  noteId: id,
                  claimText: text,
                  verdict: verdict.verdict,
                  reason: verdict.reason,
                  sources: verdict.sources,
                })
                .returning();
              send({ type: "claim", claim });
            } catch (error) {
              failed += 1;
              send({
                type: "claim_error",
                claimText: text,
                error:
                  error instanceof Error ? error.message : "Check failed",
              });
            }
          }),
        );

        await db
          .update(notes)
          .set({ factCheckIncomplete: failed > 0 })
          .where(eq(notes.id, id));
        send({ type: "done", incomplete: failed > 0 });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "Fact-check failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
