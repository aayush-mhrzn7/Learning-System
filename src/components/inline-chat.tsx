"use client";

import type { Editor } from "@tiptap/react";
import { MessageSquarePlus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SelectionAnchor = {
  top: number;
  left: number;
  text: string;
};

export function InlineChat({ editor }: { editor: Editor }) {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
    }

    editor.on("selectionUpdate", syncSelection);
    editor.on("blur", () => {
      // Keep open chat while focusing the input; clear only idle selection chrome.
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

  if (!anchor) return null;

  const preview =
    anchor.text.length > 140
      ? `${anchor.text.slice(0, 140).trimEnd()}…`
      : anchor.text;

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
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-[#333] bg-[#141414] px-2.5 py-1.5 text-[11px] text-[#ddd] shadow-xl hover:border-[#555] hover:bg-[#1a1a1a]"
        >
          <MessageSquarePlus size={13} className="text-[#aaa]" />
          Inline chat
          <kbd className="ml-1 rounded border border-[#333] px-1 py-px text-[9px] text-[#777]">
            ⌘J
          </kbd>
        </button>
      ) : (
        <div className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-[#333] bg-[#111] shadow-2xl">
          <div className="flex items-start gap-2 border-b border-[#2a2a2a] px-3 py-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-[#888]" />
            <p className="min-w-0 flex-1 text-[11px] leading-4 text-[#999]">
              <span className="text-[#666]">Selected · </span>
              <span className="line-clamp-3 whitespace-pre-wrap text-[#ccc]">
                {preview}
              </span>
            </p>
            <button
              type="button"
              aria-label="Close inline chat"
              onClick={() => {
                setOpen(false);
                setDraft("");
                if (editor.state.selection.empty) setAnchor(null);
              }}
              className="rounded p-0.5 text-[#666] hover:bg-white/5 hover:text-[#ccc]"
            >
              <X size={13} />
            </button>
          </div>
          <div className="p-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  setDraft("");
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  // UI only for now — wire model later.
                  setDraft("");
                }
              }}
              rows={2}
              placeholder="Ask about this selection…"
              className="w-full resize-none rounded-md border border-[#2a2a2a] bg-[#0a0a0a] px-2.5 py-2 text-[12px] leading-5 text-[#eee] outline-none placeholder:text-[#555] focus:border-[#444]"
            />
            <div className="mt-1.5 flex items-center justify-between px-0.5">
              <span className="text-[10px] text-[#555]">
                Enter to send · Esc to close
              </span>
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => setDraft("")}
                className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-black disabled:opacity-30"
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
