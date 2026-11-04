"use client";

import { LoaderCircle, PanelLeftOpen, Sparkles, Waypoints } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { VisualizeDiagramView } from "@/components/visualize-diagram";
import type { VisualizeState } from "@/db/schema";
import type { NoteDetail } from "@/lib/types";
import { emptyVisualize, normalizeVisualize } from "@/lib/visualize";

export function VisualizeNote({
  noteId,
  sidebarCollapsed,
  onOpenSidebar,
  onTitleChange,
}: {
  noteId: string;
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
  onTitleChange: (noteId: string, title: string) => void;
}) {
  const [title, setTitle] = useState("Untitled");
  const [visualize, setVisualize] = useState<VisualizeState>(emptyVisualize);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [streamReply, setStreamReply] = useState("");
  const [streamExplanation, setStreamExplanation] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setDraft("");
    setBusy(false);
    setStarted(false);
    setStreamReply("");
    setStreamExplanation("");
    void (async () => {
      const response = await fetch(`/api/notes/${noteId}`);
      if (!response.ok) {
        toast.error("Could not load visualize note");
        return;
      }
      const data = (await response.json()) as { note: NoteDetail };
      if (cancelled) return;
      const next = normalizeVisualize(data.note.visualize);
      setTitle(data.note.title);
      setVisualize(next);
      setStarted(next.messages.length > 0);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [visualize.messages, busy, streamReply, streamExplanation]);

  useEffect(() => {
    if (!loaded) return;
    inputRef.current?.focus();
  }, [loaded, visualize.messages.length]);

  async function send() {
    const message = draft.trim();
    if (!message || busy) return;

    const previous = visualize;
    const optimistic: VisualizeState = {
      messages: [
        ...visualize.messages,
        { role: "user", content: message, at: new Date().toISOString() },
      ],
    };

    setDraft("");
    setStarted(true);
    setVisualize(optimistic);
    setBusy(true);
    setStreamReply("");
    setStreamExplanation("");

    try {
      const response = await fetch(`/api/notes/${noteId}/visualize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok || !response.body) {
        const fail = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(fail?.error || "Visualize request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            reply?: string;
            explanation?: string;
            error?: string;
            note?: { title: string; visualize: VisualizeState | null };
          };
          if (event.type === "delta") {
            setStreamReply(event.reply ?? "");
            setStreamExplanation(event.explanation ?? "");
            continue;
          }
          if (event.type === "error") {
            throw new Error(event.error || "Visualize request failed");
          }
          if (event.type === "done" && event.note) {
            sawDone = true;
            setVisualize(normalizeVisualize(event.note.visualize));
            setStreamReply("");
            setStreamExplanation("");
            if (event.note.title !== title) {
              setTitle(event.note.title);
              onTitleChange(noteId, event.note.title);
            }
          }
        }
      }

      if (!sawDone) {
        throw new Error("Visualize stream ended early");
      }
    } catch (error) {
      setVisualize(previous);
      setStarted(previous.messages.length > 0);
      setDraft(message);
      setStreamReply("");
      setStreamExplanation("");
      toast.error(
        error instanceof Error ? error.message : "Visualize request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center text-xs text-muted-foreground">
        Loading…
      </main>
    );
  }

  const empty = !started;

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
      {sidebarCollapsed ? (
        <button
          onClick={onOpenSidebar}
          className="icon-button absolute left-3 top-3 z-10 sm:left-4 sm:top-4"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      ) : null}

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
          <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-white sm:text-3xl">
            What should we visualize?
          </h1>
          <p className="mb-8 max-w-md text-center text-xs text-[#777]">
            Software, architecture, algorithms, and data flows only — not a
            general chatbot.
          </p>
          <div className="w-full max-w-2xl">
            <PromptBox
              inputRef={inputRef}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              onSend={() => void send()}
              placeholder="e.g. How does a transformer work?"
            />
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="mb-4 flex shrink-0 items-center gap-2 text-[13px] text-[#888]">
            <Waypoints size={13} />
            <span className="truncate font-medium text-[#ccc]">{title}</span>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1">
            {visualize.messages.map((turn, index) => (
              <div key={`${turn.at}-${index}`} className="space-y-2">
                <p
                  className={`text-[14px] leading-5 ${
                    turn.role === "user" ? "text-[#aaa]" : "text-[#ddd]"
                  }`}
                >
                  <span className="mr-1 text-[#555]">
                    {turn.role === "user" ? "You" : "Viz"}
                  </span>
                  <span className="whitespace-pre-wrap">{turn.content}</span>
                </p>
                {turn.role === "assistant" && turn.diagram ? (
                  <div className="space-y-3">
                    <VisualizeDiagramView diagram={turn.diagram} />
                    {turn.explanation ? (
                      <p className="text-[15px] leading-6 text-[#bbb]">
                        {turn.explanation}
                      </p>
                    ) : null}
                    {turn.formula ? (
                      <div className="rounded-lg border border-[#222] bg-[#0c0c0c] px-3 py-2">
                        <p className="mb-1 text-[12px] uppercase tracking-wide text-[#666]">
                          Formula
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[14px] leading-5 text-[#e8e8e8]">
                          {turn.formula}
                        </pre>
                      </div>
                    ) : null}
                    {turn.sampleInput || turn.sampleOutput ? (
                      <div className="grid gap-2 rounded-lg border border-[#222] bg-[#0c0c0c] p-3 text-[13px] leading-5 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[12px] uppercase tracking-wide text-[#666]">
                            Sample input
                          </p>
                          <p className="whitespace-pre-wrap text-[#ccc]">
                            {turn.sampleInput || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="mb-1 text-[12px] uppercase tracking-wide text-[#666]">
                            Sample output
                          </p>
                          <p className="whitespace-pre-wrap text-[#ccc]">
                            {turn.sampleOutput || "—"}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
              <div className="space-y-3">
                {(streamReply || streamExplanation) && (
                  <div className="space-y-2">
                    {streamReply ? (
                      <p className="text-[14px] leading-5 text-[#ddd]">
                        <span className="mr-1 text-[#555]">Viz</span>
                        <span className="whitespace-pre-wrap">
                          {streamReply}
                        </span>
                      </p>
                    ) : null}
                    {streamExplanation ? (
                      <p className="whitespace-pre-wrap text-[15px] leading-6 text-[#bbb]">
                        {streamExplanation}
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="flex h-[200px] items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a] text-[14px] text-[#666]">
                  <span className="inline-flex items-center gap-1.5">
                    <LoaderCircle size={12} className="animate-spin" />
                    {streamReply || streamExplanation
                      ? "Finishing diagram…"
                      : "Drawing…"}
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="mt-3 shrink-0">
            <PromptBox
              inputRef={inputRef}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              onSend={() => void send()}
              placeholder="Ask another visualization…"
            />
          </div>
        </div>
      )}
    </main>
  );
}

function PromptBox({
  inputRef,
  draft,
  setDraft,
  busy,
  onSend,
  placeholder,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  onSend: () => void;
  placeholder: string;
}) {
  return (
    <div className="w-full rounded-2xl border border-[#2a2a2a] bg-[#141414] p-3 shadow-2xl">
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        rows={3}
        disabled={busy}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-5 text-[#eee] outline-none placeholder:text-[#555] disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between px-0.5">
        <span className="inline-flex items-center gap-1 text-[12px] text-[#555]">
          <Sparkles size={11} />
          Visualize only
        </span>
        <button
          type="button"
          disabled={!draft.trim() || busy}
          onClick={onSend}
          className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-black disabled:opacity-30"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
