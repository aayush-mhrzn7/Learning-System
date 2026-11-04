import OpenAI from "openai";
import { z } from "zod";
import {
  DECISIONS_MODEL,
  type ResolvedProviderCredentials,
} from "@/lib/providers";

const EXTRACT_CHUNK_CHARS = 2800;
const DECISION_BATCH_SIZE = 40;

/** Only claims scoring above this get a paid web Responses call. */
export const CLAIM_WEB_CHECK_THRESHOLD = 0.8;

const extractedClaimsSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().min(1),
    }),
  ),
});

const sourceSchema = z.object({ title: z.string(), url: z.url() });

function normalizeSources(value: unknown): { title: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    let title = "";
    let url = "";
    if (typeof item === "string") {
      const match = item.match(/https?:\/\/\S+/);
      url = match?.[0]?.replace(/[),.;]+$/, "") ?? "";
      title = match ? item.replace(match[0], "").trim() || url : "";
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      url = typeof record.url === "string" ? record.url : "";
      title =
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : url;
    }
    if (!url || seen.has(url)) continue;
    const parsed = sourceSchema.safeParse({ title: title || url, url });
    if (!parsed.success) continue;
    seen.add(url);
    out.push(parsed.data);
  }

  return out.slice(0, 8);
}

const verdictSchema = z.object({
  verdict: z.enum(["correct", "incorrect", "unsure"]),
  reason: z.string().min(1),
  sources: z
    .preprocess(normalizeSources, z.array(sourceSchema).max(8))
    .default([]),
});

const gapsSchema = z.object({
  eligible: z.boolean(),
  reason: z.string(),
  gaps: z.array(z.string().min(1)).max(5),
});

function createClient(credentials: ResolvedProviderCredentials) {
  return new OpenAI({
    apiKey: credentials.apiKey,
    baseURL: credentials.baseUrl,
    // Free OpenRouter models + web search regularly exceed the default wait.
    timeout: 180_000,
    maxRetries: 1,
    defaultHeaders:
      credentials.provider === "openrouter"
        ? {
            "HTTP-Referer": "https://learning-system.local",
            "X-Title": "Learning System",
          }
        : undefined,
  });
}

/** OpenAI native search vs OpenRouter server tool (works with free :free models). */
function webSearchTools(credentials: ResolvedProviderCredentials) {
  if (credentials.provider === "openrouter") {
    // OpenRouter extension — not in the OpenAI SDK tool union.
    return [
      {
        type: "openrouter:web_search",
        parameters: {
          // Parallel turbo is the cheapest OpenRouter search engine (~$0.001/call).
          engine: "parallel",
          mode: "turbo",
          max_results: 5,
        },
      },
    ] as unknown as OpenAI.Responses.Tool[];
  }

  return [{ type: "web_search" as const }] as unknown as OpenAI.Responses.Tool[];
}

function collectOutputText(response: OpenAI.Responses.Response): string {
  if (response.output_text?.trim()) return response.output_text.trim();

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function collectSearchSources(
  response: OpenAI.Responses.Response,
): { title: string; url: string }[] {
  const sources: { title: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const item of response.output ?? []) {
    const action = (item as { action?: { sources?: unknown } }).action;
    const list = action?.sources;
    if (!Array.isArray(list)) continue;
    for (const source of list) {
      if (!source || typeof source !== "object") continue;
      const url =
        "url" in source && typeof source.url === "string" ? source.url : null;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title =
        "title" in source && typeof source.title === "string" && source.title
          ? source.title
          : url;
      sources.push({ title, url });
    }
  }

  return sources.slice(0, 8);
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through
      }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("The model returned no structured output");
  }
}

/** Split long notes so free/reasoning models don't hang on one giant extract call. */
function chunkNoteText(text: string, maxChars = EXTRACT_CHUNK_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }
    for (let i = 0; i < paragraph.length; i += maxChars) {
      chunks.push(paragraph.slice(i, i + maxChars));
    }
    current = "";
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  const pool = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: pool }, () => run()));
  return results;
}

function responseExtras(
  credentials: ResolvedProviderCredentials,
  webSearch: boolean,
) {
  // gpt-5-nano burns a tiny max_output_tokens budget entirely on reasoning and
  // returns an empty message ("no structured output"). Keep headroom + low effort.
  if (credentials.provider === "gpt") {
    return {
      max_output_tokens: webSearch ? 12_000 : 16_000,
      reasoning: { effort: "low" as const },
    };
  }
  return {
    max_output_tokens: webSearch ? 6_000 : 8_000,
  };
}

async function structuredResponse<T>(
  credentials: ResolvedProviderCredentials,
  name: string,
  schema: Record<string, unknown>,
  instructions: string,
  input: string,
  webSearch = false,
): Promise<T> {
  const client = createClient(credentials);
  const response = await client.responses.create({
    model: credentials.model,
    instructions,
    input,
    store: false,
    ...responseExtras(credentials, webSearch),
    ...(webSearch
      ? {
          tools: webSearchTools(credentials),
          tool_choice: "auto" as const,
          ...(credentials.provider === "gpt"
            ? {
                include: ["web_search_call.action.sources" as const],
              }
            : {}),
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

  const raw = collectOutputText(response);
  if (!raw) {
    const reason = response.incomplete_details?.reason;
    throw new Error(
      reason === "max_output_tokens"
        ? "The model ran out of output tokens before returning JSON. Try again or switch model."
        : "The model returned no structured output",
    );
  }

  try {
    return parseJsonObject(raw) as T;
  } catch (error) {
    // Free OpenRouter models often ignore json_schema when tools run.
    // Reformat the prose answer (and search URLs) into JSON without another search.
    if (!webSearch || credentials.provider !== "openrouter") {
      throw error;
    }

    const searchSources = collectSearchSources(response);
    const reformatted: T = await structuredResponse<T>(
      credentials,
      name,
      schema,
      [
        "Convert the fact-check notes into the required JSON schema only.",
        "Do not add new facts. Prefer the notes' conclusion for verdict and reason.",
        "Include source title/url pairs when present.",
      ].join(" "),
      [
        "Fact-check notes:",
        raw,
        searchSources.length
          ? `Search sources:\n${JSON.stringify(searchSources)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      false,
    );

    if (
      name === "claim_verdict" &&
      reformatted &&
      typeof reformatted === "object" &&
      searchSources.length
    ) {
      const verdict = reformatted as {
        sources?: { title: string; url: string }[];
      };
      if (!verdict.sources?.length) {
        verdict.sources = searchSources;
      }
    }

    return reformatted;
  }
}

const claimsSchemaPayload = {
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
} as const;

const extractInstructions = [
  "Extract only independently verifiable factual assertions from the note.",
  "A claim must assert something about the world, a system, a definition, a mechanism, a number, or a causal relationship that could be true or false.",
  "Return each claim using the exact contiguous text from the note.",
  "Do not rewrite, normalize, summarize, or include opinions.",
  "Skip headings, incomplete fragments, transitions, examples framed as illustration only,",
  "and any sentence that is mainly about the note's writing quality, missing explanation, chunk boundaries, clarity, or retrieval usefulness.",
  "Skip pedagogical meta like 'X introduces Y but does not explain…' or 'this can negatively affect…' unless it asserts a checkable technical fact.",
  "Prefer at most 12 claims from this passage.",
].join(" ");

export async function extractClaims(
  credentials: ResolvedProviderCredentials,
  noteText: string,
) {
  const chunks = chunkNoteText(noteText);
  if (chunks.length === 0) return [];

  const chunkResults = await mapPool(chunks, 2, async (chunk) => {
    const data = await structuredResponse<unknown>(
      credentials,
      "extracted_claims",
      claimsSchemaPayload,
      extractInstructions,
      chunk,
    );
    return extractedClaimsSchema.parse(data).claims;
  });

  const seen = new Set<string>();
  const claims: { text: string }[] = [];
  for (const claim of chunkResults.flat()) {
    const key = claim.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    claims.push({ text: claim.text.trim() });
  }
  return claims;
}

export function shouldWebCheckClaim(score: number) {
  return score > CLAIM_WEB_CHECK_THRESHOLD;
}

/**
 * OpenAI Decisions API (`gpt-6-luna`): predicate probability per claim.
 * High probability = concrete, checkable fact worth a paid web Responses call.
 */
export async function decideClaims(
  credentials: ResolvedProviderCredentials,
  claims: { text: string }[],
): Promise<{ text: string; score: number }[]> {
  if (claims.length === 0) return [];
  if (credentials.provider !== "gpt") {
    throw new Error(
      "OpenAI Decisions requires a ChatGPT API key. OpenRouter is disabled.",
    );
  }

  const batches: { text: string; index: number }[][] = [];
  for (let i = 0; i < claims.length; i += DECISION_BATCH_SIZE) {
    batches.push(
      claims.slice(i, i + DECISION_BATCH_SIZE).map((claim, offset) => ({
        text: claim.text,
        index: i + offset,
      })),
    );
  }

  const scores = new Array<number>(claims.length).fill(0);
  const client = createClient(credentials);

  await mapPool(batches, 2, async (batch) => {
    const decision = await client.decisions.create({
      model: DECISIONS_MODEL,
      input: [
        {
          role: "developer",
          content: [
            "Decide whether each claim deserves a paid web fact-check.",
            "True only for concrete, independently verifiable factual assertions that could be false",
            "(definition, mechanism, property, history, API behavior, numeric claim).",
            "False for opinions, incomplete fragments, headings, rhetorical questions,",
            "writing-quality commentary, missing-context complaints, chunking/retrieval pedagogy,",
            "or anything not checkable as true/false against public sources.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Evaluate each claim in the JSON evidence by id.",
            },
            {
              type: "input_json",
              data: {
                claims: batch.map((item) => ({
                  id: `claim_${item.index}`,
                  text: item.text,
                })),
              },
            },
          ],
        },
      ],
      questions: batch.map((item) => ({
        type: "predicate" as const,
        name: `claim_${item.index}`,
        instructions: `Is claim id "claim_${item.index}" worth a paid web fact-check?`,
      })),
    });

    for (const answer of decision.answers) {
      if (answer.type !== "predicate" || !answer.name) continue;
      const match = /^claim_(\d+)$/.exec(answer.name);
      if (!match) continue;
      const index = Number(match[1]);
      if (Number.isNaN(index) || index < 0 || index >= claims.length) continue;
      scores[index] = answer.probability;
    }
  });

  return claims.map((claim, index) => ({
    text: claim.text,
    score: scores[index] ?? 0,
  }));
}

export async function judgeClaim(
  credentials: ResolvedProviderCredentials,
  claim: string,
) {
  const data = await structuredResponse<unknown>(
    credentials,
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
      "Fact-check only the factual truth of this claim using web search.",
      "Search before answering when the claim depends on facts, definitions, or established knowledge.",
      "correct = reliable sources support the asserted fact.",
      "incorrect = reliable sources contradict it. The reason MUST state the wrong part and the correct fact in one or two short sentences.",
      "unsure = sources conflict or do not cover this specific factual assertion. Do not use unsure for writing quality.",
      "Never critique missing context, clarity, completeness, chunking, retrieval quality, tone, or how well the claim explains something.",
      "Never say the claim is incomplete or needs more explanation — that is not a fact-check.",
      "If the text is not a factual assertion, return unsure with reason 'Not a checkable factual claim.' and empty sources.",
      "Include direct source URLs only when they support the verdict.",
    ].join(" "),
    claim,
    true,
  );
  return verdictSchema.parse(data);
}

export async function findMissingTopics(
  credentials: ResolvedProviderCredentials,
  noteText: string,
) {
  const data = await structuredResponse<unknown>(
    credentials,
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
    // Gaps only needs the head of long notes.
    noteText.length > 8000 ? noteText.slice(0, 8000) : noteText,
  );
  return gapsSchema.parse(data);
}
