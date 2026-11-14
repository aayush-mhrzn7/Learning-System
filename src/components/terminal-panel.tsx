"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  complete,
  pathOf,
  runCommand,
  type TerminalContext,
  type TerminalLine,
} from "@/lib/terminal";
import type { TreePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  tree: TreePayload;
  getTree: () => TreePayload;
  reload: () => Promise<void>;
  openNote: (id: string) => void;
  onClose: () => void;
};

type Row = TerminalLine | { type: "prompt"; path: string; command: string };

const WELCOME: Row = {
  type: "text",
  text: "Scholar terminal. Type help to see what you can do.",
  tone: "muted",
};

export function TerminalPanel({
  open,
  tree,
  getTree,
  reload,
  openNote,
  onClose,
}: Props) {
  const [rows, setRows] = useState<Row[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A directory deleted elsewhere (sidebar, trash) drops us back to the root.
  const effectiveCwd =
    cwd && tree.directories.some((d) => d.id === cwd) ? cwd : null;

  // Focus whenever the panel opens or a command finishes (the input row is
  // hidden while busy, which drops focus).
  useEffect(() => {
    if (open && !busy) inputRef.current?.focus();
  }, [open, busy]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows, open, busy]);

  function context(): TerminalContext {
    return { getTree, cwd: effectiveCwd, reload, openNote };
  }

  async function submit() {
    const command = input.trim();
    const path = pathOf(getTree(), effectiveCwd);
    setInput("");
    historyIndex.current = -1;
    if (!command) {
      setRows((r) => [...r, { type: "prompt", path, command: "" }]);
      return;
    }
    history.current.push(command);
    setRows((r) => [...r, { type: "prompt", path, command }]);
    setBusy(true);
    try {
      const result = await runCommand(command, context());
      if (result.cwd !== undefined) setCwd(result.cwd);
      if (result.clear) setRows([]);
      else if (result.lines.length) setRows((r) => [...r, ...result.lines]);
      if (result.exit) onClose();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!busy) void submit();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const list = history.current;
      if (!list.length) return;
      const next =
        event.key === "ArrowUp"
          ? Math.min(historyIndex.current + 1, list.length - 1)
          : historyIndex.current - 1;
      historyIndex.current = next;
      setInput(next < 0 ? "" : (list[list.length - 1 - next] ?? ""));
    } else if (event.key === "Tab") {
      event.preventDefault();
      setInput((value) => complete(value, context()));
    } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      setRows([]);
    } else if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      setRows((r) => [
        ...r,
        { type: "prompt", path: pathOf(getTree(), effectiveCwd), command: input + "^C" },
      ]);
      setInput("");
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <section
      aria-label="Terminal"
      aria-hidden={!open}
      className={cn(
        "relative z-10 flex h-[min(20rem,45dvh)] shrink-0 flex-col border-t border-border bg-background text-[13px]",
        !open && "hidden",
      )}
      style={{ fontFamily: "var(--font-menlo)" }}
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>Terminal</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Close terminal"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rows.map((row, i) => (
          <RowView key={i} row={row} />
        ))}
        {busy ? <ProgressBar /> : null}
        <div className={cn("flex items-center gap-2", busy && "hidden")}>
          <Prompt path={pathOf(tree, effectiveCwd)} />
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-label="Terminal input"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
      </div>
    </section>
  );
}

const BAR_WIDTH = 24;
const BLOCK = 6;

function ProgressBar() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 70);
    return () => window.clearInterval(id);
  }, []);

  // Bounce a block back and forth to show work is in progress.
  const travel = BAR_WIDTH - BLOCK;
  const phase = tick % (travel * 2);
  const start = phase <= travel ? phase : travel * 2 - phase;
  const bar =
    "░".repeat(start) + "█".repeat(BLOCK) + "░".repeat(travel - start);

  return (
    <div
      className="text-muted-foreground"
      role="status"
      aria-label="Running command"
    >
      [{bar}] working…
    </div>
  );
}

function Prompt({ path }: { path: string }) {
  return (
    <span className="shrink-0 select-none text-muted-foreground">
      {path} <span className="text-foreground">$</span>
    </span>
  );
}

function RowView({ row }: { row: Row }) {
  if (row.type === "prompt") {
    return (
      <div className="flex gap-2">
        <Prompt path={row.path} />
        <span className="whitespace-pre-wrap break-all">{row.command}</span>
      </div>
    );
  }
  if (row.type === "entries") {
    return (
      <div className="flex flex-wrap gap-x-5">
        {row.entries.map((entry) => (
          <span
            key={entry.name}
            className={cn(entry.dir && "font-semibold")}
          >
            {entry.name}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "min-h-[1.25em] whitespace-pre-wrap break-words",
        row.tone === "error" && "text-destructive",
        row.tone === "muted" && "text-muted-foreground",
      )}
    >
      {row.text}
    </div>
  );
}
