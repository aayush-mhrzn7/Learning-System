import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { answerInlineSelection, localClaimContext } from "@/lib/ai";
import { requireUserId } from "@/lib/auth";
import { documentToText } from "@/lib/editor-text";
import { resolveActiveProviderCredentials } from "@/lib/provider-credentials";
import { idSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  selection: z.string().trim().min(1).max(4000),
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(6)
    .optional(),
});

export async function POST(request: Request, context: Context) {
  const { userId, error } = await requireUserId();
  if (error || !userId) return error!;

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
    .select({ content: notes.content })
    .from(notes)
    .where(
      and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
    .limit(1);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const noteText = documentToText(note.content, { skipCode: true });
  const noteContext = localClaimContext(noteText, body.selection, 2);

  try {
    const answer = await answerInlineSelection(credentials, {
      selection: body.selection,
      question: body.question,
      noteContext,
      history: body.history,
    });
    return Response.json({ answer });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Inline chat request failed",
      },
      { status: 502 },
    );
  }
}
