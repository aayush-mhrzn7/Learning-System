"use client";

import { PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import type { UsageSummary } from "@/lib/ai-usage";
import { cn } from "@/lib/utils";

function formatUsd(value: number) {
  if (value <= 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function ChartCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-black/20 p-4",
        className,
      )}
    >
      <p className="mb-3 text-xs text-foreground">{label}</p>
      {children}
    </div>
  );
}

function DayBars({
  points,
  valueKey,
  colorClass = "bg-sky-500/80",
}: {
  points: UsageSummary["byDay"];
  valueKey: "calls" | "spendUsd" | "toolCalls";
  colorClass?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p[valueKey]));
  return (
    <div className="flex h-32 items-end gap-1">
      {points.map((point) => {
        const value = point[valueKey];
        const height = Math.max(value > 0 ? 4 : 2, Math.round((value / max) * 100));
        return (
          <div
            key={`${valueKey}-${point.date}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${point.date}: ${value}`}
          >
            <div className="flex h-28 w-full items-end">
              <div
                className={cn("w-full rounded-sm", colorClass)}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="truncate text-[10px] text-muted-foreground">
              {point.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HBars({
  items,
  valueKey = "value",
  colorClass = "bg-emerald-500/80",
}: {
  items: { key: string; value: number; hint?: string }[];
  valueKey?: string;
  colorClass?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No data yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={`${valueKey}-${item.key}`}
          className="grid grid-cols-[88px_1fr_auto] items-center gap-2"
          title={item.hint}
        >
          <span className="truncate text-[11px] text-muted-foreground">
            {item.key}
          </span>
          <div className="h-2 overflow-hidden rounded bg-white/5">
            <div
              className={cn("h-full rounded", colorClass)}
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
          <span className="min-w-10 text-right text-[11px] text-muted-foreground">
            {item.hint ?? item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ShareBars({
  segments,
}: {
  segments: { key: string; value: number; colorClass: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <p className="text-[13px] text-muted-foreground">No data yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 overflow-hidden rounded bg-white/5">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={cn("h-full", seg.colorClass)}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={`${seg.key}: ${seg.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <span
            key={`legend-${seg.key}`}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span className={cn("size-2 rounded-sm", seg.colorClass)} />
            {seg.key} · {Math.round((seg.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function UsagePage({
  sidebarCollapsed,
  onOpenSidebar,
}: {
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
}) {
  const [range, setRange] = useState(7);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/settings/usage?range=${range}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as UsageSummary;
        if (!cancelled) setSummary(data);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="flex min-w-0 flex-1">
      <main className="relative flex h-dvh min-w-0 flex-1 flex-col md:h-screen">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 sm:h-14 sm:px-4 sm:py-0">
          {sidebarCollapsed ? (
            <button
              className="icon-button shrink-0"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">Usage</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Responses + Decisions metrics · estimated spend
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Range"
            className="flex shrink-0 rounded-md border border-border bg-black/40 p-0.5"
          >
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                role="radio"
                aria-checked={range === days}
                onClick={() => setRange(days)}
                className={cn(
                  "h-7 rounded px-2 text-[11px] font-medium transition-colors",
                  range === days
                    ? "bg-white/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading usage…</p>
          ) : !summary ? (
            <p className="text-xs text-muted-foreground">
              Could not load usage. Try again after the next AI call.
            </p>
          ) : (
            <UsageBody summary={summary} />
          )}
        </div>
      </main>
    </div>
  );
}

function UsageBody({ summary }: { summary: UsageSummary }) {
  const { totals } = summary;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="rounded-lg border border-border bg-black/20">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-xs text-foreground">Recent requests</p>
        </div>
        {summary.recent.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted-foreground">
            No AI calls recorded yet. Run a fact-check, gaps, chat, or visualize
            turn to populate this.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">API</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">In/Out</th>
                  <th className="px-3 py-2 font-medium">Tools</th>
                  <th className="px-3 py-2 font-medium">Latency</th>
                  <th className="px-3 py-2 font-medium">Est. $</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/60 text-foreground/80"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">{row.task}</td>
                    <td className="px-3 py-2">{row.api}</td>
                    <td className="max-w-[140px] truncate px-3 py-2">
                      {row.model}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.inputTokens}/{row.outputTokens}
                    </td>
                    <td className="px-3 py-2">{row.toolCallCount}</td>
                    <td className="px-3 py-2">{row.latencyMs}ms</td>
                    <td className="px-3 py-2">
                      {row.estimatedCostUsd == null
                        ? "—"
                        : formatUsd(row.estimatedCostUsd)}
                      {!row.ok ? (
                        <span className="ml-1 text-rose-400">err</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "Calls", value: String(totals.calls) },
          { label: "Errors", value: String(totals.errors) },
          { label: "Est. spend", value: formatUsd(totals.estimatedSpendUsd) },
          { label: "$ / call", value: formatUsd(totals.avgCostPerCallUsd) },
          { label: "Tokens", value: formatTokens(totals.totalTokens) },
          {
            label: "In / out",
            value: `${formatTokens(totals.inputTokens)} / ${formatTokens(totals.outputTokens)}`,
          },
          { label: "Tool calls", value: String(totals.toolCalls) },
          { label: "Avg latency", value: `${totals.avgLatencyMs}ms` },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-black/20 px-3 py-2.5"
          >
            <p className="text-[11px] text-muted-foreground">{card.label}</p>
            <p className="mt-1 truncate text-sm text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Avg tool calls / request: {totals.avgToolCallsPerRequest}. Spend uses a
        local price map — OpenAI billing is source of truth.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard label="Calls / day">
          <DayBars points={summary.byDay} valueKey="calls" />
        </ChartCard>
        <ChartCard label="Est. spend / day">
          <DayBars
            points={summary.byDay}
            valueKey="spendUsd"
            colorClass="bg-amber-500/80"
          />
        </ChartCard>
        <ChartCard label="Web searches / day">
          <DayBars
            points={summary.byDay}
            valueKey="toolCalls"
            colorClass="bg-teal-500/80"
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard label="Calls by task">
          <HBars
            items={summary.byTask.map((row) => ({
              key: row.task,
              value: row.calls,
            }))}
          />
        </ChartCard>
        <ChartCard label="Spend by task">
          <HBars
            items={summary.byTask.map((row) => ({
              key: row.task,
              value: row.spendUsd,
              hint: formatUsd(row.spendUsd),
            }))}
            colorClass="bg-amber-500/80"
          />
        </ChartCard>
        <ChartCard label="Tool calls by task">
          <HBars
            items={summary.byTask.map((row) => ({
              key: row.task,
              value: row.toolCalls,
            }))}
            colorClass="bg-teal-500/80"
          />
        </ChartCard>
        <ChartCard label="Calls by model">
          <HBars
            items={summary.byModel.map((row) => ({
              key: row.model,
              value: row.calls,
            }))}
            colorClass="bg-indigo-500/80"
          />
        </ChartCard>
        <ChartCard label="Spend by model">
          <HBars
            items={summary.byModel.map((row) => ({
              key: row.model,
              value: row.spendUsd,
              hint: formatUsd(row.spendUsd),
            }))}
            colorClass="bg-amber-500/80"
          />
        </ChartCard>
      </div>

      <ChartCard label="API share (calls)">
        <ShareBars
          segments={summary.byApi.map((row, index) => ({
            key: row.api,
            value: row.calls,
            colorClass:
              index === 0
                ? "bg-sky-500/80"
                : index === 1
                  ? "bg-violet-500/80"
                  : "bg-emerald-500/80",
          }))}
        />
      </ChartCard>
    </div>
  );
}
