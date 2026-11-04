import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { claims, notes } from "@/db/schema";
import { extractClaims, judgeClaim, mapPool } from "@/lib/ai";
import { requireUserId } from "@/lib/auth";
import { documentToText } from "@/lib/editor-text";
import { resolveActiveProviderCredentials } from "@/lib/provider-credentials";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

/** Free OpenRouter + web search: keep this low to avoid timeouts/rate limits. */
const JUDGE_CONCURRENCY = 2;

export async function POST(_request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  let credentials;
  try {
    credentials = await resolveActiveProviderCredentials(userId);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "AI provider is not configured",
      },
      { status: 400 },
    );
  }

  const [note] = await db
    .select({ content: notes.content })
    .from(notes)
    .where(
      and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
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
          .where(and(eq(notes.id, id), eq(notes.userId, userId)));

        send({ type: "extracting" });
        const noteText = documentToText(note.content, { skipCode: true });
        const extracted = await extractClaims(credentials, noteText);
        await db.delete(claims).where(eq(claims.noteId, id));
        send({ type: "start", total: extracted.length });

        let failed = 0;
        await mapPool(extracted, JUDGE_CONCURRENCY, async ({ text }) => {
          try {
            const verdict = await judgeClaim(credentials, text);
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
              error: error instanceof Error ? error.message : "Check failed",
            });
          }
        });

        await db
          .update(notes)
          .set({ factCheckIncomplete: failed > 0 })
          .where(and(eq(notes.id, id), eq(notes.userId, userId)));
        send({ type: "done", incomplete: failed > 0 });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Fact-check failed";
        send({
          type: "error",
          error:
            /timed out/i.test(message)
              ? "Request timed out while talking to the model. Try again, or use a faster OpenRouter model."
              : message,
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
