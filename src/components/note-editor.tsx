"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  LoaderCircle,
  PanelLeftOpen,
  ScanSearch,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClaimFlags,
  claimFlagsKey,
  type ClaimFlag,
} from "@/components/claim-flags";
import { FormattingToolbar } from "@/components/formatting-toolbar";
import { Button } from "@/components/ui/button";
import { documentToText } from "@/lib/editor-text";
import type {
  ChecklistItem,
  NotePayload,
  NoteDetail,
} from "@/lib/types";

const lowlight = createLowlight(common);

export function NoteEditor({
  noteId,
  sidebarCollapsed,
  onOpenSidebar,
  onTreeChanged,
}: {
  noteId: string;
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
  onTreeChanged: () => Promise<void>;
}) {
  const [payload, setPayload] = useState<NotePayload | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [checking, setChecking] = useState(false);
  const [checkingProgress, setCheckingProgress] = useState("");
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsMessage, setGapsMessage] = useState("");
  const [hovered, setHovered] = useState<{
    claim: ClaimFlag;
    x: number;
    y: number;
  } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const titleRef = useRef(title);
  const noteIdRef = useRef(noteId);
  const claimsRef = useRef<ClaimFlag[]>([]);
  const loadingContent = useRef(false);
  const saveNowRef = useRef<() => Promise<void>>(async () => undefined);
  const hoverTimer = useRef<number | null>(null);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    function renamed(event: Event) {
      const detail = (event as CustomEvent<{ id: string; title: string }>).detail;
      if (detail.id !== noteId) return;
      setTitle(detail.title);
      titleRef.current = detail.title;
    }
    window.addEventListener("learning-note-renamed", renamed);
    return () => window.removeEventListener("learning-note-renamed", renamed);
  }, [noteId]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      ClaimFlags,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class: "learning-editor",
        spellcheck: "true",
      },
    },
    onUpdate: () => {
      if (!loadingContent.current) scheduleSave();
    },
  });

  const saveNow = useCallback(async () => {
    if (!editor || loadingContent.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    const response = await fetch(`/api/notes/${noteIdRef.current}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleRef.current.trim() || "Untitled",
        content: editor.getJSON(),
        plainText: editor.getText({ blockSeparator: "\n" }),
      }),
    });
    if (!response.ok) {
      setSaveState("error");
      return;
    }
    const data = (await response.json()) as { note: NoteDetail };
    setPayload((current) =>
      current
        ? {
            ...current,
            note: data.note,
            claims: current.claims.map((claim) => ({
              ...claim,
              stale:
                claim.stale ||
                !data.note.plainText
                  .toLowerCase()
                  .includes(claim.claimText.toLowerCase()),
            })),
          }
        : current,
    );
    setSaveState("saved");
    await onTreeChanged();
  }, [editor, onTreeChanged]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  function scheduleSave() {
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(
      () => void saveNowRef.current(),
      1000,
    );
  }

  useEffect(() => {
    noteIdRef.current = noteId;
    if (!editor) return;
    let cancelled = false;

    void (async () => {
      const response = await fetch(`/api/notes/${noteId}`);
      if (!response.ok || cancelled) return;
      const data = (await response.json()) as NotePayload;
      loadingContent.current = true;
      editor.commands.setContent(data.note.content);
      loadingContent.current = false;
      setTitle(data.note.title);
      titleRef.current = data.note.title;
      claimsRef.current = data.claims;
      editor.view.dispatch(
        editor.state.tr.setMeta(claimFlagsKey, data.claims),
      );
      setPayload(data);
      setSaveState("saved");
    })();

    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [editor, noteId]);

  function applyClaims(claims: ClaimFlag[]) {
    claimsRef.current = claims;
    setPayload((current) =>
      current ? { ...current, claims } : current,
    );
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(claimFlagsKey, claims));
    }
  }

  async function factCheck() {
    if (checking) return;
    await saveNow();
    setChecking(true);
    setCheckingProgress("Extracting claims");
    applyClaims([]);

    try {
      const response = await fetch(`/api/notes/${noteId}/fact-check`, {
        method: "POST",
      });
      if (!response.ok || !response.body) throw new Error("Check failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as {
            type: string;
            total?: number;
            claim?: ClaimFlag;
            incomplete?: boolean;
            error?: string;
          };
          if (event.type === "start") {
            setCheckingProgress(`Checking 0 of ${event.total ?? 0}`);
          }
          if (event.type === "claim" && event.claim) {
            completed += 1;
            applyClaims([...claimsRef.current, event.claim]);
            setCheckingProgress(`Checked ${completed}`);
          }
          if (event.type === "claim_error") completed += 1;
          if (event.type === "done") {
            setPayload((current) =>
              current
                ? {
                    ...current,
                    note: {
                      ...current.note,
                      factCheckIncomplete: Boolean(event.incomplete),
                    },
                  }
                : current,
            );
          }
          if (event.type === "error") throw new Error(event.error);
        }
      }
    } catch {
      setPayload((current) =>
        current
          ? {
              ...current,
              note: { ...current.note, factCheckIncomplete: true },
            }
          : current,
      );
    } finally {
      setChecking(false);
      setCheckingProgress("");
    }
  }

  async function findGaps() {
    if (!editor) return;
    const characters = documentToText(editor.getJSON(), {
      skipCode: true,
    }).length;
    if (characters < 500) {
      setGapsMessage(
        `${500 - characters} more non-code characters required.`,
      );
      return;
    }

    setGapsLoading(true);
    setGapsMessage("");
    try {
      const response = await fetch(`/api/notes/${noteId}/gaps`, {
        method: "POST",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          checklist: ChecklistItem[];
          message?: string | null;
        };
        setPayload((current) =>
          current ? { ...current, checklist: data.checklist } : current,
        );
        setGapsMessage(data.message ?? "");
      }
    } finally {
      setGapsLoading(false);
    }
  }

  async function publish() {
    await saveNow();
    const response = await fetch(`/api/notes/${noteId}/publish`, {
      method: "POST",
    });
    if (!response.ok) return;
    const { note } = (await response.json()) as { note: NoteDetail };
    setPayload((current) => (current ? { ...current, note } : current));
    void factCheck();
  }

  async function toggleChecklist(item: ChecklistItem) {
    const ticked = !item.ticked;
    setPayload((current) =>
      current
        ? {
            ...current,
            checklist: current.checklist.map((entry) =>
              entry.id === item.id ? { ...entry, ticked } : entry,
            ),
          }
        : current,
    );
    await fetch(`/api/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticked }),
    });
  }

  if (!payload || !editor) {
    return (
      <div className="grid h-screen flex-1 place-items-center text-xs text-muted">
        Loading note…
      </div>
    );
  }

  const analysisLength = documentToText(editor.getJSON(), {
    skipCode: true,
  }).length;

  return (
    <main className="relative flex h-screen min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        {sidebarCollapsed ? (
          <button
            className="icon-button"
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        ) : null}
        <span className="text-[9px] uppercase tracking-[0.16em] text-muted">
          {payload.note.status}
        </span>
        {payload.note.editedSincePublish ? (
          <span className="text-[9px] text-amber-300/80">
            Edited since publish
          </span>
        ) : null}
        {payload.note.factCheckIncomplete ? (
          <button
            onClick={() => void factCheck()}
            className="flex items-center gap-1 text-[9px] text-amber-300/80"
          >
            <AlertCircle size={12} />
            Fact-check incomplete · Retry
          </button>
        ) : null}
        <span className="ml-auto text-[9px] text-[#666]">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "error"
              ? "Save failed"
              : "Saved"}
        </span>
        <button
          onClick={() => void factCheck()}
          disabled={checking}
          className="topbar-button"
        >
          {checking ? (
            <LoaderCircle size={13} className="animate-spin" />
          ) : (
            <ScanSearch size={13} />
          )}
          {checking ? checkingProgress : "Fact-check"}
        </button>
        <button onClick={() => void publish()} className="topbar-button solid">
          {payload.note.status === "published" ? "Re-publish" : "Publish"}
        </button>
      </header>
      <FormattingToolbar editor={editor} />

      <div className="flex-1 overflow-y-auto">
        <article className="w-full px-8 pb-32 pt-16 sm:px-14 lg:px-20">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              titleRef.current = event.target.value;
              scheduleSave();
            }}
            onBlur={() => {
              if (!title.trim()) {
                setTitle("Untitled");
                titleRef.current = "Untitled";
                scheduleSave();
              }
            }}
            className="mb-8 w-full bg-transparent text-4xl font-semibold tracking-[-0.035em] outline-none placeholder:text-[#444]"
            placeholder="Untitled"
            aria-label="Note title"
          />

          <div
            onMouseOver={(event) => {
              if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
              const target = (event.target as HTMLElement).closest<HTMLElement>(
                "[data-claim-id]",
              );
              const claim = claimsRef.current.find(
                (item) => item.id === target?.dataset.claimId,
              );
              if (claim && target) {
                const rect = target.getBoundingClientRect();
                setHovered({
                  claim,
                  x: Math.min(rect.left, window.innerWidth - 360),
                  y: rect.bottom + 8,
                });
              }
            }}
            onMouseLeave={() => {
              hoverTimer.current = window.setTimeout(
                () => setHovered(null),
                180,
              );
            }}
          >
            <EditorContent editor={editor} />
          </div>

          {payload.note.status === "published" ? (
            <section className="mt-20 border-t border-border pt-8">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="text-sm font-medium">What’s missing</h2>
                {gapsLoading ? (
                  <LoaderCircle size={13} className="animate-spin text-muted" />
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={gapsLoading || analysisLength < 500}
                  onClick={() => void findGaps()}
                >
                  {payload.checklist.length ? "Analyze again" : "Analyze gaps"}
                </Button>
              </div>
              {analysisLength < 500 ? (
                <p className="text-xs text-muted">
                  Write {500 - analysisLength} more non-code characters to
                  unlock gap analysis.
                </p>
              ) : null}
              {analysisLength >= 500 &&
              !gapsLoading &&
              payload.checklist.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <CheckCircle2 size={15} />
                  {gapsMessage ||
                    "Analyze this learning note when you’re ready."}
                </p>
              ) : null}
              {gapsMessage && payload.checklist.length > 0 ? (
                <p className="mb-4 text-xs text-muted">{gapsMessage}</p>
              ) : null}
              <div className="space-y-3">
                {payload.checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 text-sm leading-6"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleChecklist(item)}
                      className={`mt-1 grid h-4 w-4 shrink-0 place-items-center border ${
                        item.ticked
                          ? "border-foreground bg-foreground text-background"
                          : "border-[#555]"
                      }`}
                      aria-label={item.ticked ? "Mark incomplete" : "Complete"}
                    >
                      {item.ticked ? <Check size={11} /> : null}
                    </button>
                    <span
                      className={
                        item.ticked ? "text-muted line-through" : undefined
                      }
                    >
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </article>
      </div>

      {hovered ? (
        <aside
          className="fixed z-50 w-80 border border-[#333] bg-[#111] p-4 shadow-2xl"
          style={{ left: hovered.x, top: hovered.y }}
          onMouseEnter={() => {
            if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
          }}
          onMouseLeave={() => setHovered(null)}
        >
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">
            {hovered.claim.stale
              ? "Stale result"
              : hovered.claim.verdict}
          </p>
          <p className="text-xs leading-5 text-[#ddd]">
            {hovered.claim.reason}
          </p>
          {hovered.claim.sources.length ? (
            <div className="mt-3 space-y-1.5 border-t border-border pt-3">
              {hovered.claim.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[11px] text-muted underline decoration-[#555] underline-offset-2 hover:text-foreground"
                >
                  {source.title}
                </a>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}
