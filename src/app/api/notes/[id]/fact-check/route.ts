import { and, eq, inArray, isNull, not } from "drizzle-orm";
import { db } from "@/db";
import { claims, notes, type ClaimSource } from "@/db/schema";
import {
  decideClaims,
  extractClaims,
  judgeClaim,
  localClaimContext,
  mapPool,
  MAX_WEB_JUDGES,
  shouldWebCheckClaim,
} from "@/lib/ai";
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
        for (const [index, claim] of extracted.entries()) {
          send({
            type: "extracted",
            index: index + 1,
            total: extracted.length,
            text: claim.text,
          });
        }

        send({ type: "scoring", total: extracted.length });
        const decided = await decideClaims(credentials, extracted, noteText);
        const toCheck = decided
          .filter((claim) => shouldWebCheckClaim(claim.score))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_WEB_JUDGES);
        const webTexts = new Set(toCheck.map((claim) => claim.text));
        for (const [index, claim] of decided.entries()) {
          send({
            type: "scored",
            index: index + 1,
            total: decided.length,
            text: claim.text,
            score: claim.score,
            check: webTexts.has(claim.text),
          });
        }
        send({
          type: "start",
          total: toCheck.length,
          skipped: decided.length - toCheck.length,
        });

        type ReadyClaim = {
          id: string;
          noteId: string;
          claimText: string;
          verdict: "correct" | "incorrect" | "unsure";
          reason: string;
          sources: ClaimSource[];
          stale: boolean;
        };
        const ready: ReadyClaim[] = [];
        let failed = 0;
        await mapPool(toCheck, JUDGE_CONCURRENCY, async ({ text, score }) => {
          send({ type: "checking", text, score });
          try {
            const verdict = await judgeClaim(
              credentials,
              text,
              localClaimContext(noteText, text),
            );
            const claim: ReadyClaim = {
              id: crypto.randomUUID(),
              noteId: id,
              claimText: text,
              verdict: verdict.verdict,
              reason: verdict.reason,
              sources: verdict.sources,
              stale: false,
            };
            ready.push(claim);
            send({ type: "claim", claim, score });
          } catch (error) {
            failed += 1;
            send({
              type: "claim_error",
              claimText: text,
              score,
              error: error instanceof Error ? error.message : "Check failed",
            });
          }
        });

        // Swap only after judges finish — keep prior claims if the run aborts early.
        // neon-http has no multi-statement txn; insert-then-delete-old is the safe order.
        // shortcut: rare crash between insert and delete can leave old+new until next run
        if (ready.length > 0) {
          const newIds = ready.map((claim) => claim.id);
          await db.insert(claims).values(ready);
          await db
            .delete(claims)
            .where(
              and(eq(claims.noteId, id), not(inArray(claims.id, newIds))),
            );
        } else {
          await db.delete(claims).where(eq(claims.noteId, id));
        }

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
