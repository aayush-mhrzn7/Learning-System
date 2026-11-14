import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import type { ProviderId } from "@/lib/providers";

type AiApi = "responses" | "decisions";
export type AiTask =
  | "extract"
  | "decide"
  | "judge"
  | "gaps"
  | "inline"
  | "visualize"
  | "reformat";

type RecordAiUsageInput = {
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

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-6-luna": { input: 0.15, output: 0.6 },
};

const WEB_SEARCH_USD = 0.025;
const RECENT_LIMIT = 50;

function estimateCostUsd(args: {
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

function asNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getUsageSummary(
  userId: string,
  rangeDays = 7,
): Promise<UsageSummary> {
  const days = Math.min(14, Math.max(1, rangeDays));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const whereClause = and(
    eq(aiUsage.userId, userId),
    gte(aiUsage.createdAt, since),
  );

  const [totalsRow, byDayRows, byTaskRows, byApiRows, byModelRows, recentRows] =
    await Promise.all([
      db
        .select({
          calls: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
          inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          toolCalls: sql<number>`coalesce(sum(${aiUsage.toolCallCount}), 0)::int`,
          estimatedSpendUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float8`,
          latencySum: sql<number>`coalesce(sum(${aiUsage.latencyMs}), 0)::int`,
        })
        .from(aiUsage)
        .where(whereClause)
        .then((rows) => rows[0]),
      db
        .select({
          date: sql<string>`to_char((${aiUsage.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`,
          calls: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
          toolCalls: sql<number>`coalesce(sum(${aiUsage.toolCallCount}), 0)::int`,
          spendUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float8`,
          latencySum: sql<number>`coalesce(sum(${aiUsage.latencyMs}), 0)::int`,
        })
        .from(aiUsage)
        .where(whereClause)
        .groupBy(
          sql`to_char((${aiUsage.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`,
        ),
      db
        .select({
          task: aiUsage.task,
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          spendUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float8`,
          toolCalls: sql<number>`coalesce(sum(${aiUsage.toolCallCount}), 0)::int`,
          latencySum: sql<number>`coalesce(sum(${aiUsage.latencyMs}), 0)::int`,
        })
        .from(aiUsage)
        .where(whereClause)
        .groupBy(aiUsage.task),
      db
        .select({
          api: aiUsage.api,
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          spendUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float8`,
        })
        .from(aiUsage)
        .where(whereClause)
        .groupBy(aiUsage.api),
      db
        .select({
          model: aiUsage.model,
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          spendUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)::float8`,
          toolCalls: sql<number>`coalesce(sum(${aiUsage.toolCallCount}), 0)::int`,
          latencySum: sql<number>`coalesce(sum(${aiUsage.latencyMs}), 0)::int`,
        })
        .from(aiUsage)
        .where(whereClause)
        .groupBy(aiUsage.model),
      db
        .select({
          id: aiUsage.id,
          createdAt: aiUsage.createdAt,
          model: aiUsage.model,
          api: aiUsage.api,
          task: aiUsage.task,
          inputTokens: aiUsage.inputTokens,
          outputTokens: aiUsage.outputTokens,
          toolCallCount: aiUsage.toolCallCount,
          latencyMs: aiUsage.latencyMs,
          estimatedCostUsd: aiUsage.estimatedCostUsd,
          ok: aiUsage.ok,
        })
        .from(aiUsage)
        .where(whereClause)
        .orderBy(desc(aiUsage.createdAt))
        .limit(RECENT_LIMIT),
    ]);

  const calls = asNumber(totalsRow?.calls);
  const estimatedSpendUsd =
    Math.round(asNumber(totalsRow?.estimatedSpendUsd) * 1_000_000) / 1_000_000;
  const totals = {
    calls,
    errors: asNumber(totalsRow?.errors),
    inputTokens: asNumber(totalsRow?.inputTokens),
    outputTokens: asNumber(totalsRow?.outputTokens),
    totalTokens: asNumber(totalsRow?.totalTokens),
    toolCalls: asNumber(totalsRow?.toolCalls),
    estimatedSpendUsd,
    avgLatencyMs:
      calls > 0 ? Math.round(asNumber(totalsRow?.latencySum) / calls) : 0,
    avgToolCallsPerRequest:
      calls > 0
        ? Math.round((asNumber(totalsRow?.toolCalls) / calls) * 100) / 100
        : 0,
    avgCostPerCallUsd:
      calls > 0
        ? Math.round((estimatedSpendUsd / calls) * 1_000_000) / 1_000_000
        : 0,
  };

  const dayMap = new Map(
    byDayRows.map((row) => [
      row.date,
      {
        calls: asNumber(row.calls),
        errors: asNumber(row.errors),
        tokens: asNumber(row.tokens),
        inputTokens: asNumber(row.inputTokens),
        outputTokens: asNumber(row.outputTokens),
        toolCalls: asNumber(row.toolCalls),
        spendUsd: asNumber(row.spendUsd),
        latencySum: asNumber(row.latencySum),
      },
    ]),
  );

  const byDay: UsageSummary["byDay"] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const hit = dayMap.get(key);
    byDay.push({
      date: key,
      calls: hit?.calls ?? 0,
      errors: hit?.errors ?? 0,
      tokens: hit?.tokens ?? 0,
      inputTokens: hit?.inputTokens ?? 0,
      outputTokens: hit?.outputTokens ?? 0,
      toolCalls: hit?.toolCalls ?? 0,
      spendUsd: Math.round((hit?.spendUsd ?? 0) * 1_000_000) / 1_000_000,
      avgLatencyMs:
        hit && hit.calls > 0 ? Math.round(hit.latencySum / hit.calls) : 0,
    });
  }

  return {
    rangeDays: days,
    totals,
    byDay,
    byTask: byTaskRows
      .map((row) => {
        const rowCalls = asNumber(row.calls);
        return {
          task: row.task,
          calls: rowCalls,
          tokens: asNumber(row.tokens),
          spendUsd: Math.round(asNumber(row.spendUsd) * 1_000_000) / 1_000_000,
          toolCalls: asNumber(row.toolCalls),
          avgLatencyMs:
            rowCalls > 0
              ? Math.round(asNumber(row.latencySum) / rowCalls)
              : 0,
        };
      })
      .sort((a, b) => b.calls - a.calls),
    byApi: byApiRows
      .map((row) => ({
        api: row.api,
        calls: asNumber(row.calls),
        tokens: asNumber(row.tokens),
        spendUsd: Math.round(asNumber(row.spendUsd) * 1_000_000) / 1_000_000,
      }))
      .sort((a, b) => b.calls - a.calls),
    byModel: byModelRows
      .map((row) => {
        const rowCalls = asNumber(row.calls);
        return {
          model: row.model,
          calls: rowCalls,
          tokens: asNumber(row.tokens),
          spendUsd: Math.round(asNumber(row.spendUsd) * 1_000_000) / 1_000_000,
          toolCalls: asNumber(row.toolCalls),
          avgLatencyMs:
            rowCalls > 0
              ? Math.round(asNumber(row.latencySum) / rowCalls)
              : 0,
        };
      })
      .sort((a, b) => b.calls - a.calls),
    recent: recentRows.map((row) => ({
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
