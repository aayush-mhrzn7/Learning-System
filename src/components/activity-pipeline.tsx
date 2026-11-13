"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  PanelRightClose,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ACTIVITY_WIDTH_KEY = "learning-activity-width";
const ACTIVITY_MIN_WIDTH = 280;
const ACTIVITY_MAX_WIDTH = 640;
const ACTIVITY_DEFAULT_WIDTH = 352;

function readActivityWidth() {
  if (typeof window === "undefined") return ACTIVITY_DEFAULT_WIDTH;
  const raw = Number(localStorage.getItem(ACTIVITY_WIDTH_KEY));
  if (!Number.isFinite(raw)) return ACTIVITY_DEFAULT_WIDTH;
  return Math.min(ACTIVITY_MAX_WIDTH, Math.max(ACTIVITY_MIN_WIDTH, raw));
}

export type PipelineKind = "fact-check" | "publish" | "re-publish";

type PipelineStepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

type PipelineStep = {
  id: string;
  label: string;
  detail?: string;
  status: PipelineStepStatus;
  logs: string[];
};

export type PipelineRun = {
  id: string;
  kind: PipelineKind;
  status: "running" | "success" | "failed";
  steps: PipelineStep[];
};

const KIND_LABEL: Record<PipelineKind, string> = {
  "fact-check": "Fact-check",
  publish: "Publish",
  "re-publish": "Re-publish",
};

function emptyStep(id: string, label: string): PipelineStep {
  return { id, label, status: "pending", logs: [] };
}

export function createPipelineRun(
  kind: PipelineKind,
  options?: { skipFactCheck?: boolean },
): PipelineRun {
  const steps: PipelineStep[] = [emptyStep("save", "Save note")];
  if (kind !== "fact-check") {
    steps.push(
      emptyStep(
        "publish",
        kind === "re-publish" ? "Re-publish note" : "Publish note",
      ),
    );
  }
  if (!options?.skipFactCheck) {
    steps.push(
      emptyStep("extract", "Extract claims"),
      emptyStep("score", "Score claims"),
      emptyStep("web", "Web fact-check"),
    );
    // Gaps only on publish/re-publish with fact-check — not as-is, not fact-check-only.
    if (kind !== "fact-check") {
      steps.push(emptyStep("gaps", "What's missing"));
    }
  }
  steps.push(emptyStep("complete", "Complete"));
  return {
    id: crypto.randomUUID(),
    kind,
    status: "running",
    steps,
  };
}

export function patchPipelineStep(
  run: PipelineRun,
  stepId: string,
  patch: Partial<Pick<PipelineStep, "status" | "detail">> & {
    log?: string;
    logs?: string[];
  },
): PipelineRun {
  return {
    ...run,
    steps: run.steps.map((step) => {
      if (step.id !== stepId) return step;
      const nextLogs = patch.logs
        ? patch.logs
        : patch.log
          ? [...step.logs, patch.log]
          : step.logs;
      return {
        ...step,
        status: patch.status ?? step.status,
        detail: patch.detail ?? step.detail,
        logs: nextLogs,
      };
    }),
  };
}

export function ActivityPipeline({
  open,
  run,
  onClose,
}: {
  open: boolean;
  run: PipelineRun | null;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(ACTIVITY_DEFAULT_WIDTH);
  const dragging = useRef(false);

  useEffect(() => {
    setWidth(readActivityWidth());
  }, []);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragging.current = true;
      const startX = event.clientX;
      const startWidth = width;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function onMove(moveEvent: PointerEvent) {
        if (!dragging.current) return;
        // Dragging the left edge: move left → wider.
        const next = Math.min(
          ACTIVITY_MAX_WIDTH,
          Math.max(
            ACTIVITY_MIN_WIDTH,
            startWidth + (startX - moveEvent.clientX),
          ),
        );
        setWidth(next);
      }

      function onUp(upEvent: PointerEvent) {
        dragging.current = false;
        target.releasePointerCapture(upEvent.pointerId);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setWidth((current) => {
          localStorage.setItem(ACTIVITY_WIDTH_KEY, String(current));
          return current;
        });
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width],
  );

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/55 md:hidden"
        aria-label="Close activity"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex h-dvh max-md:!w-[min(100vw-3rem,22rem)] shrink-0 flex-col border-l border-border bg-sidebar shadow-2xl md:relative md:z-auto md:h-screen md:shadow-none"
        style={{ width }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize activity panel"
          aria-valuemin={ACTIVITY_MIN_WIDTH}
          aria-valuemax={ACTIVITY_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setWidth((current) => {
              const delta = event.key === "ArrowLeft" ? 16 : -16;
              const next = Math.min(
                ACTIVITY_MAX_WIDTH,
                Math.max(ACTIVITY_MIN_WIDTH, current + delta),
              );
              localStorage.setItem(ACTIVITY_WIDTH_KEY, String(next));
              return next;
            });
          }}
          className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize touch-none hover:bg-white/10 active:bg-white/20 md:block"
        />
        <div className="flex h-14 items-center justify-between border-b border-border px-3 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Activity
            </p>
            <p className="truncate text-xs font-medium">
              {run ? KIND_LABEL[run.kind] : "No active run"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button"
            aria-label="Close activity"
          >
            <PanelRightClose size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {!run ? (
            <p className="px-1 text-xs leading-5 text-muted-foreground">
              Live steps appear here when you fact-check, publish, or re-publish.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {run.steps.map((step) => (
                <PipelineStepRow key={step.id} step={step} />
              ))}
            </ol>
          )}
        </div>

        {run ? (
          <div className="border-t border-border px-4 py-3">
            <p
              className={cn(
                "text-[12px] uppercase tracking-[0.14em]",
                run.status === "running" && "text-muted-foreground",
                run.status === "success" && "text-foreground",
                run.status === "failed" && "text-destructive",
              )}
            >
              {run.status === "running"
                ? "Running…"
                : run.status === "success"
                  ? "Succeeded"
                  : "Failed"}
            </p>
          </div>
        ) : null}
      </aside>
    </>
  );
}

function PipelineStepRow({ step }: { step: PipelineStep }) {
  const hasLogs = step.logs.length > 0;
  const [open, setOpen] = useState(
    () => step.status === "running" || hasLogs,
  );

  useEffect(() => {
    if (step.status === "running") setOpen(true);
  }, [step.status]);

  useEffect(() => {
    if (hasLogs && step.status === "running") setOpen(true);
  }, [hasLogs, step.logs.length, step.status]);

  return (
    <li className={cn("rounded-sm", open && hasLogs && "border border-border/60")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 px-2 py-2 text-left hover:bg-muted"
        aria-expanded={open}
      >
        <StepIcon status={step.status} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-xs leading-4",
              step.status === "pending" && "text-muted-foreground",
              step.status === "running" && "text-foreground",
              step.status === "success" && "text-foreground",
              step.status === "failed" && "text-destructive",
              step.status === "skipped" && "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {step.detail ? (
            <span className="mt-0.5 block text-[13px] leading-4 text-muted-foreground">
              {step.detail}
            </span>
          ) : null}
        </span>
        {hasLogs ? (
          open ? (
            <ChevronDown size={14} className="mt-0.5 text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="mt-0.5 text-muted-foreground" />
          )
        ) : null}
      </button>

      {open && hasLogs ? (
        <pre className="mx-2 mb-2 max-h-64 overflow-auto border border-border/50 bg-muted px-2.5 py-2 font-mono text-[12px] leading-4 text-foreground whitespace-pre-wrap break-words">
          {step.logs.join("\n")}
        </pre>
      ) : null}
    </li>
  );
}

function StepIcon({ status }: { status: PipelineStepStatus }) {
  if (status === "running") {
    return (
      <span
        className="mt-0.5 size-3.5 shrink-0 rounded-full border border-foreground bg-foreground/20"
        aria-label="Running"
      />
    );
  }
  if (status === "success") {
    return (
      <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <Check size={9} strokeWidth={3} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full bg-destructive text-background">
        <X size={9} strokeWidth={3} />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border border-border text-[10px] text-muted-foreground">
        –
      </span>
    );
  }
  return <Circle size={14} className="mt-0.5 shrink-0 text-muted-foreground" />;
}
