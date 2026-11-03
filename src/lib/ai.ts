import OpenAI from "openai";
import { z } from "zod";

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";

const extractedClaimsSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().min(1),
    }),
  ),
});

const verdictSchema = z.object({
  verdict: z.enum(["correct", "incorrect", "unsure"]),
  reason: z.string().min(1),
  sources: z
    .array(z.object({ title: z.string(), url: z.url() }))
    .max(8)
    .default([]),
});

const gapsSchema = z.object({
  eligible: z.boolean(),
  reason: z.string(),
  gaps: z.array(z.string().min(1)).max(5),
});

let client: OpenAI | undefined;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

async function structuredResponse<T>(
  name: string,
  schema: Record<string, unknown>,
  instructions: string,
  input: string,
  webSearch = false,
) {
  const response = await getClient().responses.create({
    model: MODEL,
    instructions,
    input,
    store: false,
    ...(webSearch
      ? {
          tools: [{ type: "web_search" as const }],
          tool_choice: "required" as const,
          include: ["web_search_call.action.sources" as const],
        }
      : {}),
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("The model returned no structured output");
  }
  return JSON.parse(response.output_text) as T;
}

export async function extractClaims(noteText: string) {
  const data = await structuredResponse<unknown>(
    "extracted_claims",
    {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
            additionalProperties: false,
          },
        },
      },
      required: ["claims"],
      additionalProperties: false,
    },
    [
      "Extract independently verifiable prose claims from the note.",
      "Return each claim using the exact contiguous text from the note.",
      "Do not rewrite, normalize, summarize, or include opinions.",
      "Skip headings that are only labels and skip incomplete fragments.",
    ].join(" "),
    noteText,
  );
  return extractedClaimsSchema.parse(data).claims;
}

export async function judgeClaim(claim: string) {
  const data = await structuredResponse<unknown>(
    "claim_verdict",
    {
      type: "object",
      properties: {
        verdict: {
          type: "string",
          enum: ["correct", "incorrect", "unsure"],
        },
        reason: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
            },
            required: ["title", "url"],
            additionalProperties: false,
          },
        },
      },
      required: ["verdict", "reason", "sources"],
      additionalProperties: false,
    },
    [
      "Fact-check this claim using web search.",
      "Use correct only when reliable sources support it.",
      "Use incorrect when reliable sources contradict it.",
      "Use unsure when evidence is ambiguous or insufficient.",
      "Explain briefly and include direct source URLs.",
    ].join(" "),
    claim,
    true,
  );
  return verdictSchema.parse(data);
}

export async function findMissingTopics(noteText: string) {
  const data = await structuredResponse<unknown>(
    "missing_topics",
    {
      type: "object",
      properties: {
        eligible: { type: "boolean" },
        reason: { type: "string" },
        gaps: {
          type: "array",
          maxItems: 5,
          items: { type: "string", maxLength: 180 },
        },
      },
      required: ["eligible", "reason", "gaps"],
      additionalProperties: false,
    },
    [
      "You are a rigorous curriculum reviewer evaluating a learner's own note.",
      "First decide whether the text is a substantive learning note.",
      "Eligible notes explain concepts, mechanisms, arguments, procedures, or technical ideas in the learner's own words.",
      "Reject placeholders, casual thoughts, journals, to-do lists, random text, isolated questions, copied prompts, code-only content, and notes without a coherent learning topic.",
      "If ineligible, set eligible=false, briefly explain why, and return no gaps.",
      "If eligible, infer the exact subject and learning goal from this note only.",
      "Identify at most five important conceptual omissions that materially limit understanding.",
      "Consider missing foundations, mechanisms, assumptions, trade-offs, limitations, edge cases, or a necessary concrete example only when specifically relevant.",
      "Every gap must name the exact missing concept and its relationship to this note.",
      "Never return generic advice such as add more detail, define terms, include examples, improve structure, discuss publishing, or explain the topic.",
      "Do not critique grammar, style, formatting, code quality, or note length.",
      "Do not write replacement prose or text the learner can paste.",
      "Do not repeat anything already covered in the note.",
      "When the note is already conceptually sufficient, return an empty gaps list.",
    ].join(" "),
    noteText,
  );
  return gapsSchema.parse(data);
}
