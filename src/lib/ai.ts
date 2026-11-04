import OpenAI from "openai";
import { z } from "zod";
import {
  DECISIONS_MODEL,
  type ResolvedProviderCredentials,
} from "@/lib/providers";

const EXTRACT_CHUNK_CHARS = 2800;
const DECISION_BATCH_SIZE = 40;

/** Only claims with P(likely wrong) above this get a paid web fact-check. */
export const CLAIM_WEB_CHECK_THRESHOLD = 0.8;
/** Hard cap after extract — Decisions never sees a 50-claim firehose. */
export const MAX_EXTRACTED_CLAIMS = 8;
/** Hard cap on paid web judges per run (highest suspicion first). */
export const MAX_WEB_JUDGES = 5;

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
  "Extract ONLY claims that look suspicious or high-risk to be factually wrong — sparse is better.",
  "Prioritize: blunt/wrong-looking definitions, contradictions with nearby text, wrong mechanisms/numbers/causal facts.",
  "Always keep a blunt false definition even when a nearby sentence states the correct one.",
  "Return each claim using the exact contiguous text from the note. Do not rewrite.",
  "SKIP ordinary true tutorial facts and pipeline steps (e.g. convert to embeddings, store in a vector DB, retrieve chunks, pass to the LLM).",
  "SKIP advantages/disadvantages lists, configuration descriptions, soft 'common approach' lines, and example walkthrough narration.",
  "SKIP headings, fragments, transitions, writing-quality / pedagogy meta.",
  "Prefer at most 5 claims from this passage. Empty list is fine if nothing looks wrong.",
].join(" ");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Index of claim text in the note, allowing flexible whitespace. */
function findClaimOffset(noteText: string, claimText: string): number {
  const needle = claimText.trim();
  if (!needle) return -1;
  const exact = noteText.indexOf(needle);
  if (exact >= 0) return exact;
  const parts = needle.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return -1;
  const match = new RegExp(parts.join("\\s+"), "i").exec(noteText);
  return match?.index ?? -1;
}

/** ±paragraph window around a claim so the judge can interpret it in-note. */
export function localClaimContext(
  noteText: string,
  claimText: string,
  radius = 2,
) {
  const trimmed = noteText.trim();
  if (!trimmed) return "";
  const idx = findClaimOffset(trimmed, claimText);
  if (idx < 0) return "";

  const paragraphs = trimmed.split(/\n{2,}/);
  let cursor = 0;
  let hit = 0;
  for (let i = 0; i < paragraphs.length; i += 1) {
    const block = paragraphs[i] ?? "";
    const start = cursor;
    const end = start + block.length;
    if (idx >= start && idx <= end) {
      hit = i;
      break;
    }
    cursor = end + (i < paragraphs.length - 1 ? 2 : 0);
  }

  const slice = paragraphs
    .slice(Math.max(0, hit - radius), hit + radius + 1)
    .join("\n\n")
    .trim();
  return slice.length > 2200 ? `${slice.slice(0, 2200)}…` : slice;
}

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
    if (claims.length >= MAX_EXTRACTED_CLAIMS) break;
  }
  return claims;
}

export function shouldWebCheckClaim(score: number) {
  // score = P(likely factually wrong). Web-search only high-suspicion claims.
  return score > CLAIM_WEB_CHECK_THRESHOLD;
}

/**
 * OpenAI Decisions API (`gpt-6-luna`).
 * Ask "is this claim likely WRONG?" — only high scores burn a paid web judge.
 */
export async function decideClaims(
  credentials: ResolvedProviderCredentials,
  claims: { text: string }[],
  noteText = "",
): Promise<{ text: string; score: number }[]> {
  if (claims.length === 0) return [];
  if (credentials.provider !== "gpt") {
    throw new Error(
      "OpenAI Decisions requires a ChatGPT API key. OpenRouter is disabled.",
    );
  }

  const batches: { text: string; index: number; context: string }[][] = [];
  for (let i = 0; i < claims.length; i += DECISION_BATCH_SIZE) {
    batches.push(
      claims.slice(i, i + DECISION_BATCH_SIZE).map((claim, offset) => ({
        text: claim.text,
        index: i + offset,
        context: noteText
          ? localClaimContext(noteText, claim.text, 1).slice(0, 900)
          : "",
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
            "You are a cheap gate before paid web fact-checking. Minimize web calls.",
            "For each claim, estimate whether it is LIKELY FACTUALLY WRONG and needs web verification.",
            "True (high) = likely incorrect: false definitions, wrong mechanisms/numbers, claims that contradict the surrounding note context,",
            "or blunt mistakes a careful reader would flag (e.g. 'semantic chunking means chunking by character length' next to a correct meaning-based definition).",
            "False (low) = skip web search: ordinary true tutorial facts, standard RAG pipeline steps,",
            "correct definitions, soft 'common approach' lines, advantages/disadvantages, config descriptions,",
            "example walkthrough narration, opinions, incomplete fragments.",
            "Use surrounding context when provided. When unsure, prefer False (skip) to save cost —",
            "only True when there is a concrete reason to suspect the claim is wrong.",
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
                  context: item.context || undefined,
                })),
              },
            },
          ],
        },
      ],
      questions: batch.map((item) => ({
        type: "predicate" as const,
        name: `claim_${item.index}`,
        instructions: [
          `Is claim id "claim_${item.index}" LIKELY FACTUALLY WRONG and worth a paid web fact-check?`,
          `True only if it looks incorrect or contradicts its context.`,
          `False for ordinary true tutorial content — skip the web call.`,
        ].join(" "),
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
  noteContext = "",
) {
  const packed = [
    "CLAIM:",
    claim,
    "",
    "SURROUNDING NOTE CONTEXT (for interpretation only — judge the claim, not the whole window):",
    noteContext.trim() || "(none)",
  ].join("\n");

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
      "Fact-check the CLAIM using web search. Use SURROUNDING NOTE CONTEXT only to interpret what the learner meant.",
      "If context shows an example/walkthrough/observation (e.g. similarity between neighboring sentence embeddings dropping when sample topics shift from FastAPI to PostgreSQL), judge that narrative — do NOT reframe it as a claim that FastAPI or PostgreSQL compute vector similarity.",
      "correct = sources support the claim as meant in context, OR it is soft fluff / illustration / common-approach wording that is not a false technical assertion.",
      "incorrect = the learner asserted a false definition, mechanism, number, or causal fact (as meant in context). Example: 'semantic chunking means chunking by character length' while semantic chunking splits by meaning.",
      "If the context contains a conflicting correct definition of the same term, treat that as strong evidence the CLAIM is incorrect when search agrees.",
      "For incorrect, reason MUST be one or two short sentences: wrong part + correct fact. Include ≥1 direct source URL. Never return incorrect with empty sources.",
      "unsure = sources conflict, evidence is weak, or the proposition is under-specified even with context. Prefer unsure over incorrect when evidence is thin.",
      "Never critique writing quality, missing explanation, clarity, or retrieval usefulness.",
      "Never invent a framework-vs-database lecture from an illustrative example sentence.",
    ].join(" "),
    packed,
    true,
  );
  const verdict = verdictSchema.parse(data);
  // No red underline without evidence.
  if (verdict.verdict === "incorrect" && verdict.sources.length === 0) {
    return {
      ...verdict,
      verdict: "unsure" as const,
      reason: verdict.reason || "Insufficient sources to mark incorrect.",
    };
  }
  return verdict;
}

const inlineReplySchema = z.object({
  answer: z.string().min(1).max(4000),
});

const visualizeTurnSchema = z.object({
  accepted: z.boolean(),
  title: z.string().max(80).nullable(),
  reply: z.string().min(1).max(600),
  explanation: z.string().max(400),
  diagram: z
    .object({
      nodes: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            label: z.string().min(1).max(48),
          }),
        )
        .max(8),
      edges: z
        .array(
          z.object({
            source: z.string().min(1).max(40),
            target: z.string().min(1).max(40),
            label: z.string().max(40),
          }),
        )
        .max(12)
        .transform((edges) =>
          edges.map((edge) => {
            const label = edge.label.trim();
            return label
              ? { source: edge.source, target: edge.target, label }
              : { source: edge.source, target: edge.target };
          }),
        ),
    })
    .nullable(),
});

export type VisualizeTurnResult = z.infer<typeof visualizeTurnSchema>;

/** Tiny architecture/algorithm diagram turn — rejects general chat. */
export async function answerVisualizeTurn(
  credentials: ResolvedProviderCredentials,
  args: {
    message: string;
    history?: { role: "user" | "assistant"; content: string }[];
    hasDiagram: boolean;
  },
): Promise<VisualizeTurnResult> {
  const history = (args.history ?? []).slice(-8);
  const packed = [
    history.length
      ? `PRIOR TURNS:\n${history
          .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
          .join("\n\n")}`
      : "",
    "",
    `HAS_EXISTING_DIAGRAM: ${args.hasDiagram ? "yes" : "no"}`,
    "",
    "USER:",
    args.message.trim(),
  ]
    .filter((line) => line !== "")
    .join("\n");

  const data = await structuredResponse<unknown>(
    credentials,
    "visualize_turn",
    {
      type: "object",
      properties: {
        accepted: { type: "boolean" },
        title: { type: ["string", "null"] },
        reply: { type: "string" },
        explanation: { type: "string" },
        diagram: {
          anyOf: [
            {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" },
                    },
                    required: ["id", "label"],
                    additionalProperties: false,
                  },
                },
                edges: {
                  type: "array",
                  maxItems: 12,
                  items: {
                    type: "object",
                    properties: {
                      source: { type: "string" },
                      target: { type: "string" },
                      label: { type: "string" },
                    },
                    required: ["source", "target", "label"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["nodes", "edges"],
              additionalProperties: false,
            },
            { type: "null" },
          ],
        },
      },
      required: ["accepted", "title", "reply", "explanation", "diagram"],
      additionalProperties: false,
    },
    [
      "You only visualize software systems, architecture, algorithms, data flows, and similar diagrams.",
      "Reject general chat, homework essays, coding help, writing, opinions, or anything that is not a visualize request.",
      "When rejected: accepted=false, diagram=null, explanation=\"\", reply briefly clarifies this tool is only for visualizing software/architecture/algorithms and asks them to rephrase.",
      "When accepted: accepted=true, return a MINIMAL diagram (prefer ≤6 nodes) and a short explanation (≤2 sentences).",
      "Node ids must be short snake_case; edge source/target must match node ids; edge label is \"\" when unused.",
      "Edges must follow pipeline direction (upstream → downstream) so the diagram can lay out top-to-bottom in order.",
      "Each accepted question gets its own new diagram block (do not assume overwriting a single canvas).",
      "Follow-ups should draw a fresh diagram for that request. Never invent URLs or research links. Never return executable code.",
      "title: short note title on the first accepted turn; otherwise null.",
    ].join(" "),
    packed,
    false,
  );

  const parsed = visualizeTurnSchema.parse(data);
  if (!parsed.accepted) {
    return {
      ...parsed,
      diagram: null,
      explanation: "",
      title: null,
    };
  }
  if (!parsed.diagram || parsed.diagram.nodes.length === 0) {
    return {
      ...parsed,
      accepted: false,
      diagram: null,
      explanation: "",
      title: null,
      reply:
        "I can only draw software, architecture, and algorithm diagrams. Ask me to visualize something like that.",
    };
  }
  // Drop edges that point at missing nodes — keeps D3 stable.
  const ids = new Set(parsed.diagram.nodes.map((node) => node.id));
  return {
    ...parsed,
    diagram: {
      nodes: parsed.diagram.nodes.slice(0, 8),
      edges: parsed.diagram.edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .slice(0, 12),
    },
  };
}

/** Tutor reply about a selected passage — no web search, no note rewrites. */
export async function answerInlineSelection(
  credentials: ResolvedProviderCredentials,
  args: {
    selection: string;
    question: string;
    noteContext: string;
    history?: { role: "user" | "assistant"; content: string }[];
  },
) {
  const history = (args.history ?? []).slice(-6);
  const packed = [
    "SELECTED PASSAGE:",
    args.selection.trim(),
    "",
    "SURROUNDING NOTE CONTEXT:",
    args.noteContext.trim() || "(none)",
    "",
    history.length
      ? `PRIOR TURNS:\n${history
          .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
          .join("\n\n")}`
      : "",
    "",
    "QUESTION:",
    args.question.trim(),
  ]
    .filter((line) => line !== "")
    .join("\n");

  const data = await structuredResponse<unknown>(
    credentials,
    "inline_chat_reply",
    {
      type: "object",
      properties: {
        answer: { type: "string" },
      },
      required: ["answer"],
      additionalProperties: false,
    },
    [
      "You are a concise learning tutor for the learner's own note.",
      "Answer the QUESTION about the SELECTED PASSAGE, using SURROUNDING NOTE CONTEXT only for interpretation.",
      "Explain clearly; correct misconceptions when they appear in the selection.",
      "Do not rewrite the note, invent paste-ready replacement prose, or critique writing style.",
      "Keep the answer short (a few sentences unless the question needs a short list).",
      "If the question is outside the selection/context, say what is missing instead of guessing.",
    ].join(" "),
    packed,
    false,
  );
  return inlineReplySchema.parse(data).answer.trim();
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
