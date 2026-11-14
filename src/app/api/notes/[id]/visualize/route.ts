import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notes, type VisualizeMessage, type VisualizeState } from "@/db/schema";
import { streamVisualizeTurn } from "@/lib/ai";
import { requireUserId } from "@/lib/auth";
import { resolveActiveProviderCredentials } from "@/lib/provider-credentials";
import { idSchema } from "@/lib/schemas";
import {
  emptyVisualize,
  hasAnyDiagram,
  normalizeVisualize,
} from "@/lib/visualize";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
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
    .select({
      kind: notes.kind,
      title: notes.title,
      visualize: notes.visualize,
    })
    .from(notes)
    .where(
      and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
    .limit(1);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  if (note.kind !== "visualize") {
    return Response.json(
      { error: "Not a visualize note" },
      { status: 400 },
    );
  }

  const current = normalizeVisualize(note.visualize ?? emptyVisualize);
  const history = current.messages.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        for await (const event of streamVisualizeTurn(credentials, {
          message: body.message,
          history,
          hasDiagram: hasAnyDiagram(current),
        })) {
          if (event.type === "delta") {
            send({
              type: "delta",
              reply: event.reply,
              explanation: event.explanation,
            });
            continue;
          }
          if (event.type === "error") {
            send({ type: "error", error: event.error });
            break;
          }

          const turn = event.turn;
          const now = new Date().toISOString();
          const userTurn: VisualizeMessage = {
            role: "user",
            content: body.message,
            at: now,
          };
          const assistantTurn: VisualizeMessage = {
            role: "assistant",
            content: turn.reply,
            at: now,
            ...(turn.accepted && turn.diagram
              ? {
                  diagram: turn.diagram,
                  explanation: turn.explanation || undefined,
                  sampleInput: turn.sampleInput || undefined,
                  sampleOutput: turn.sampleOutput || undefined,
                  formula: turn.formula.trim() || undefined,
                }
              : {}),
          };

          const next: VisualizeState = {
            messages: [...current.messages, userTurn, assistantTurn].slice(-40),
          };

          const titleCandidate = turn.title?.trim();
          const shouldRetitle =
            Boolean(titleCandidate) &&
            turn.accepted &&
            (!note.title.trim() ||
              note.title.trim().toLowerCase() === "untitled" ||
              note.title.trim().toLowerCase() === "untitled visualize");

          const [updated] = await db
            .update(notes)
            .set({
              visualize: next,
              title: shouldRetitle ? titleCandidate! : undefined,
              plainText: next.messages
                .map((m) =>
                  [
                    `${m.role}: ${m.content}`,
                    m.explanation ? `explanation: ${m.explanation}` : "",
                    m.sampleInput ? `sample_input: ${m.sampleInput}` : "",
                    m.sampleOutput ? `sample_output: ${m.sampleOutput}` : "",
                    m.formula ? `formula: ${m.formula}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                )
                .join("\n\n")
                .slice(0, 500_000),
              updatedAt: new Date(),
            })
            .where(and(eq(notes.id, id), eq(notes.userId, userId)))
            .returning({
              id: notes.id,
              title: notes.title,
              kind: notes.kind,
              visualize: notes.visualize,
              updatedAt: notes.updatedAt,
            });

          send({
            type: "done",
            accepted: turn.accepted,
            note: {
              ...updated,
              visualize: normalizeVisualize(updated?.visualize ?? next),
            },
          });
        }
      } catch (err) {
        send({
          type: "error",
          error:
            err instanceof Error ? err.message : "Visualize request failed",
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
    },
  });
}
