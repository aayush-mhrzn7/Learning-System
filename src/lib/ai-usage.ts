import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import type { ProviderId } from "@/lib/providers";

export type AiApi = "responses" | "decisions";
export type AiTask =
  | "extract"
  | "decide"
  | "judge"
  | "gaps"
  | "inline"
  | "visualize"
  | "reformat";

export type RecordAiUsageInput = {
  userId: string;
  provider: ProviderId;
  model: string;
  api: AiApi;
  task: AiTask;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  toolCallCount?: number;
  latencyMs?: number;
  webSearchRequests?: number;
  ok?: boolean;
  error?: string | null;
};

/**
 * shortcut: approximate list prices — refresh when OpenAI/OpenRouter changes them.
 * Units: USD per 1M tokens. Web search: USD per billable request.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-6-luna": { input: 0.15, output: 0.6 },
};

const WEB_SEARCH_USD = 0.025;

export function estimateCostUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchRequests?: number;
}): number | null {
  const rates = PRICE_PER_MTOK[args.model];
  if (!rates) return null;
  const tokens =
    (args.inputTokens / 1_000_000) * rates.input +
    (args.outputTokens / 1_000_000) * rates.output;
  const search = (args.webSearchRequests ?? 0) * WEB_SEARCH_USD;
  return tokens + search;
}

/** Fire-and-forget safe: never throw into the LLM path. */
export async function recordAiUsage(input: RecordAiUsageInput) {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const totalTokens =
    input.totalTokens ?? inputTokens + outputTokens;
  const toolCallCount = input.toolCallCount ?? 0;
  const estimatedCostUsd = estimateCostUsd({
    model: input.model,
    inputTokens,
    outputTokens,
    webSearchRequests: input.webSearchRequests ?? toolCallCount,
  });

  try {
    await db.insert(aiUsage).values({
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      api: input.api,
      task: input.task,
      inputTokens,
      outputTokens,
      totalTokens,
      toolCallCount,
      latencyMs: input.latencyMs ?? 0,
      estimatedCostUsd,
      ok: input.ok ?? true,
      error: input.error ?? null,
    });
  } catch (error) {
    console.error("[ai_usage] failed to record", error);
  }
}

export type UsageSummary = {
  rangeDays: number;
  totals: {
    calls: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    toolCalls: number;
    estimatedSpendUsd: number;
    avgLatencyMs: number;
    avgToolCallsPerRequest: number;
    avgCostPerCallUsd: number;
  };
  byDay: {
    date: string;
    calls: number;
    errors: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    toolCalls: number;
    spendUsd: number;
    avgLatencyMs: number;
  }[];
  byTask: {
    task: string;
    calls: number;
    tokens: number;
    spendUsd: number;
    toolCalls: number;
    avgLatencyMs: number;
  }[];
  byApi: { api: string; calls: number; tokens: number; spendUsd: number }[];
  byModel: {
    model: string;
    calls: number;
    tokens: number;
    spendUsd: number;
    toolCalls: number;
    avgLatencyMs: number;
  }[];
  recent: {
    id: string;
    createdAt: string;
    model: string;
    api: string;
    task: string;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
    latencyMs: number;
    estimatedCostUsd: number | null;
    ok: boolean;
  }[];
};

export async function getUsageSummary(
  userId: string,
  rangeDays = 7,
): Promise<UsageSummary> {
  const days = Math.min(90, Math.max(1, rangeDays));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)))
    .orderBy(desc(aiUsage.createdAt));

  const totals = {
    calls: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
    estimatedSpendUsd: 0,
    avgLatencyMs: 0,
    avgToolCallsPerRequest: 0,
    avgCostPerCallUsd: 0,
  };
  let latencySum = 0;
  type DayAgg = {
    calls: number;
    errors: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    toolCalls: number;
    spendUsd: number;
    latencySum: number;
  };
  type BucketAgg = {
    calls: number;
    tokens: number;
    spendUsd: number;
    toolCalls: number;
    latencySum: number;
  };
  const dayMap = new Map<string, DayAgg>();
  const taskMap = new Map<string, BucketAgg>();
  const apiMap = new Map<string, BucketAgg>();
  const modelMap = new Map<string, BucketAgg>();

  for (const row of rows) {
    const spend = row.estimatedCostUsd ?? 0;
    totals.calls += 1;
    if (!row.ok) totals.errors += 1;
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.totalTokens += row.totalTokens;
    totals.toolCalls += row.toolCallCount;
    totals.estimatedSpendUsd += spend;
    latencySum += row.latencyMs;

    const date = row.createdAt.toISOString().slice(0, 10);
    const day = dayMap.get(date) ?? {
      calls: 0,
      errors: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      spendUsd: 0,
      latencySum: 0,
    };
    day.calls += 1;
    if (!row.ok) day.errors += 1;
    day.tokens += row.totalTokens;
    day.inputTokens += row.inputTokens;
    day.outputTokens += row.outputTokens;
    day.toolCalls += row.toolCallCount;
    day.spendUsd += spend;
    day.latencySum += row.latencyMs;
    dayMap.set(date, day);

    const bump = (map: Map<string, BucketAgg>, key: string) => {
      const bucket = map.get(key) ?? {
        calls: 0,
        tokens: 0,
        spendUsd: 0,
        toolCalls: 0,
        latencySum: 0,
      };
      bucket.calls += 1;
      bucket.tokens += row.totalTokens;
      bucket.spendUsd += spend;
      bucket.toolCalls += row.toolCallCount;
      bucket.latencySum += row.latencyMs;
      map.set(key, bucket);
    };
    bump(taskMap, row.task);
    bump(apiMap, row.api);
    bump(modelMap, row.model);
  }

  totals.avgLatencyMs =
    totals.calls > 0 ? Math.round(latencySum / totals.calls) : 0;
  totals.avgToolCallsPerRequest =
    totals.calls > 0
      ? Math.round((totals.toolCalls / totals.calls) * 100) / 100
      : 0;
  totals.estimatedSpendUsd =
    Math.round(totals.estimatedSpendUsd * 1_000_000) / 1_000_000;
  totals.avgCostPerCallUsd =
    totals.calls > 0
      ? Math.round((totals.estimatedSpendUsd / totals.calls) * 1_000_000) /
        1_000_000
      : 0;

  const emptyDay = (): DayAgg => ({
    calls: 0,
    errors: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    spendUsd: 0,
    latencySum: 0,
  });

  const byDay: UsageSummary["byDay"] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const hit = dayMap.get(key) ?? emptyDay();
    byDay.push({
      date: key,
      calls: hit.calls,
      errors: hit.errors,
      tokens: hit.tokens,
      inputTokens: hit.inputTokens,
      outputTokens: hit.outputTokens,
      toolCalls: hit.toolCalls,
      spendUsd: Math.round(hit.spendUsd * 1_000_000) / 1_000_000,
      avgLatencyMs:
        hit.calls > 0 ? Math.round(hit.latencySum / hit.calls) : 0,
    });
  }

  const fromBucket = ([key, v]: [string, BucketAgg]) => ({
    calls: v.calls,
    tokens: v.tokens,
    spendUsd: Math.round(v.spendUsd * 1_000_000) / 1_000_000,
    toolCalls: v.toolCalls,
    avgLatencyMs: v.calls > 0 ? Math.round(v.latencySum / v.calls) : 0,
    key,
  });

  return {
    rangeDays: days,
    totals,
    byDay,
    byTask: [...taskMap.entries()]
      .map((entry) => {
        const row = fromBucket(entry);
        return {
          task: row.key,
          calls: row.calls,
          tokens: row.tokens,
          spendUsd: row.spendUsd,
          toolCalls: row.toolCalls,
          avgLatencyMs: row.avgLatencyMs,
        };
      })
      .sort((a, b) => b.calls - a.calls),
    byApi: [...apiMap.entries()]
      .map((entry) => {
        const row = fromBucket(entry);
        return {
          api: row.key,
          calls: row.calls,
          tokens: row.tokens,
          spendUsd: row.spendUsd,
        };
      })
      .sort((a, b) => b.calls - a.calls),
    byModel: [...modelMap.entries()]
      .map((entry) => {
        const row = fromBucket(entry);
        return {
          model: row.key,
          calls: row.calls,
          tokens: row.tokens,
          spendUsd: row.spendUsd,
          toolCalls: row.toolCalls,
          avgLatencyMs: row.avgLatencyMs,
        };
      })
      .sort((a, b) => b.calls - a.calls),
    recent: rows.slice(0, 40).map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      model: row.model,
      api: row.api,
      task: row.task,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      toolCallCount: row.toolCallCount,
      latencyMs: row.latencyMs,
      estimatedCostUsd: row.estimatedCostUsd,
      ok: row.ok,
    })),
  };
}
