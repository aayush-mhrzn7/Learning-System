"use client";

import type { Editor } from "@tiptap/react";
import { LoaderCircle, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { aiToasts } from "@/lib/toast-messages";

type SelectionAnchor = {
  top: number;
  left: number;
  text: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type InlineChatSeed = {
  text: string;
  top: number;
  left: number;
};

export function InlineChat({
  editor,
  noteId,
  seed,
  onSeedConsumed,
}: {
  editor: Editor;
  noteId: string;
  seed?: InlineChatSeed | null;
  onSeedConsumed?: () => void;
}) {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const turnsEndRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!seed?.text.trim()) return;
    const text = seed.text.trim();
    abortRef.current?.abort();
    abortRef.current = null;
    selectionRef.current = text;
    setAnchor({ top: seed.top, left: seed.left, text });
    setDraft("");
    setTurns([]);
    setBusy(false);
    setOpen(true);
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => {
    function syncSelection() {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        if (!open) setAnchor(null);
        return;
      }
      const text = editor.state.doc.textBetween(from, to, "\n").trim();
      if (!text) {
        if (!open) setAnchor(null);
        return;
      }
      const end = editor.view.coordsAtPos(to);
      setAnchor({
        top: end.bottom + 8,
        left: Math.min(end.left, window.innerWidth - 360),
        text,
      });
      if (!open) selectionRef.current = text;
    }

    editor.on("selectionUpdate", syncSelection);
    editor.on("blur", () => {
      window.setTimeout(() => {
        if (open) return;
        const active = document.activeElement;
        if (active?.closest?.("[data-inline-chat]")) return;
        if (editor.state.selection.empty) setAnchor(null);
      }, 0);
    });
    return () => {
      editor.off("selectionUpdate", syncSelection);
    };
  }, [editor, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "j") {
        return;
      }
      const { empty } = editor.state.selection;
      if (empty) return;
      event.preventDefault();
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, "\n").trim();
      if (!text) return;
      const end = editor.view.coordsAtPos(to);
      selectionRef.current = text;
      setAnchor({
        top: end.bottom + 8,
        left: Math.min(end.left, window.innerWidth - 360),
        text,
      });
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  function closeChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setOpen(false);
    setDraft("");
    setTurns([]);
    setBusy(false);
    if (editor.state.selection.empty) setAnchor(null);
  }

  async function send() {
    const question = draft.trim();
    const selection = selectionRef.current || anchor?.text || "";
    if (!question || !selection || busy) return;

    const history = turns.slice(-6);
    setDraft("");
    setTurns((prev) => [...prev, { role: "user", content: question }]);
    setBusy(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/notes/${noteId}/inline-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ selection, question, history }),
      });
      const data = (await response.json().catch(() => null)) as {
        answer?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.answer) {
        throw new Error(data?.error || aiToasts.inlineChatFailed);
      }
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: data.answer! },
      ]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setTurns((prev) => prev.slice(0, -1));
      setDraft(question);
      toast.error(
        error instanceof Error ? error.message : aiToasts.inlineChatFailed,
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  if (!anchor) return null;

  const preview =
    (selectionRef.current || anchor.text).length > 140
      ? `${(selectionRef.current || anchor.text).slice(0, 140).trimEnd()}…`
      : selectionRef.current || anchor.text;

  return (
    <div
      data-inline-chat
      className="fixed z-50"
      style={{ top: anchor.top, left: Math.max(12, anchor.left) }}
    >
      {!open ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            selectionRef.current = anchor.text;
            setOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-xl hover:border-foreground/25 hover:bg-muted"
        >
          <MessageSquarePlus size={13} className="text-muted-foreground" />
          Inline chat
          <kbd className="ml-1 rounded border border-border px-1 py-px text-[11px] text-muted-foreground">
            ⌘J
          </kbd>
        </button>
      ) : (
        <div className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-start gap-2 border-b border-border px-3 py-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-[13px] leading-4 text-muted-foreground">
              <span className="text-muted-foreground/80">Selected · </span>
              <span className="line-clamp-3 whitespace-pre-wrap text-foreground">
                {preview}
              </span>
            </p>
            <button
              type="button"
              aria-label="Close inline chat"
              onClick={closeChat}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          {turns.length > 0 || busy ? (
            <div className="max-h-48 space-y-2 overflow-y-auto border-b border-border px-3 py-2">
              {turns.map((turn, index) => (
                <p
                  key={`${turn.role}-${index}`}
                  className="whitespace-pre-wrap text-[13px] leading-4 text-foreground"
                >
                  <span className="text-muted-foreground">
                    {turn.role === "user" ? "You · " : "Tutor · "}
                  </span>
                  {turn.content}
                </p>
              ))}
              {busy ? (
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <LoaderCircle size={12} className="animate-spin" />
                  Thinking…
                </p>
              ) : null}
              <div ref={turnsEndRef} />
            </div>
          ) : null}
          <div className="p-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeChat();
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="Ask about this selection…"
              className="w-full resize-none rounded-md border border-border bg-muted px-2.5 py-2 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring disabled:opacity-60"
            />
            <div className="mt-1.5 flex items-center justify-between px-0.5">
              <span className="text-[12px] text-muted-foreground">
                Enter to send · Esc to close
              </span>
              <button
                type="button"
                disabled={!draft.trim() || busy}
                onClick={() => void send()}
                className="rounded-md bg-theme-accent px-2 py-1 text-[12px] font-medium text-white disabled:opacity-30"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
