"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  LoaderCircle,
  PanelLeftOpen,
  PanelRightOpen,
  Pencil,
  ScanSearch,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ActivityPipeline,
  createPipelineRun,
  patchPipelineStep,
  type PipelineKind,
  type PipelineRun,
} from "@/components/activity-pipeline";
import {
  ClaimFlags,
  claimFlagsKey,
  type ClaimFlag,
} from "@/components/claim-flags";
import { EditorMinimap } from "@/components/editor-minimap";
import { FormattingToolbar } from "@/components/formatting-toolbar";
import { InlineChat } from "@/components/inline-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { documentToText } from "@/lib/editor-text";
import {
  FONT_SIZE_CHANGED_EVENT,
  MINIMAP_CHANGED_EVENT,
  readFontSize,
  readMinimapEnabled,
  type FontSizeOption,
} from "@/lib/editor-preferences";
import type {
  ChecklistItem,
  NotePayload,
  NoteDetail,
} from "@/lib/types";

const lowlight = createLowlight(common);

function formatStamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NoteEditor({
  noteId,
  sidebarCollapsed,
  onOpenSidebar,
  onTreeChanged,
  onTitleChange,
}: {
  noteId: string;
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
  onTreeChanged: () => Promise<void>;
  onTitleChange: (noteId: string, title: string) => void;
}) {
  const [payload, setPayload] = useState<NotePayload | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsMessage, setGapsMessage] = useState("");
  // Default reading mode (mobile-first); desktop flips to edit after mount.
  const [readOnly, setReadOnly] = useState(true);
  const [hovered, setHovered] = useState<{
    claim: ClaimFlag;
    x: number;
    y: number;
  } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const titleRef = useRef(title);
  const noteIdRef = useRef(noteId);
  const claimsRef = useRef<ClaimFlag[]>([]);
  const pipelineStepRef = useRef("save");
  const pipelineGenRef = useRef(0);
  // Block autosave until the note for noteId is loaded into the editor.
  // Otherwise an empty initial doc (or a stale prior note) can overwrite Neon.
  const loadingContent = useRef(true);
  const hydratedNoteId = useRef<string | null>(null);
  const saveNowRef = useRef<() => Promise<void>>(async () => undefined);
  const hoverTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const [minimapRevision, setMinimapRevision] = useState(0);
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [fontSize, setFontSize] = useState<FontSizeOption>("md");

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    setMinimapEnabled(readMinimapEnabled());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setMinimapEnabled(detail?.enabled ?? readMinimapEnabled());
    }
    window.addEventListener(MINIMAP_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MINIMAP_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    setFontSize(readFontSize());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ size: FontSizeOption }>).detail;
      setFontSize(detail?.size ?? readFontSize());
    }
    window.addEventListener(FONT_SIZE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FONT_SIZE_CHANGED_EVENT, onChange);
  }, []);

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
        "data-font-size": "md",
      },
    },
    onUpdate: () => {
      if (!loadingContent.current) scheduleSave();
      setMinimapRevision((value) => value + 1);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("data-font-size", fontSize);
    setMinimapRevision((value) => value + 1);
  }, [editor, fontSize]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setReadOnly(false);
    }
  }, []);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  const saveNow = useCallback(async () => {
    if (!editor || loadingContent.current || !editor.isEditable) return;
    const targetNoteId = noteIdRef.current;
    if (hydratedNoteId.current !== targetNoteId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    const response = await fetch(`/api/notes/${targetNoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleRef.current.trim() || "Untitled",
        content: editor.getJSON(),
        plainText: editor.getText({ blockSeparator: "\n" }),
      }),
    });
    if (noteIdRef.current !== targetNoteId) return;
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
    setTitle(data.note.title);
    titleRef.current = data.note.title;
    onTitleChange(targetNoteId, data.note.title);
    setSaveState("saved");
    await onTreeChanged();
  }, [editor, onTitleChange, onTreeChanged]);

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
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    loadingContent.current = true;
    hydratedNoteId.current = null;
    noteIdRef.current = noteId;
    setPayload(null);
    pipelineGenRef.current += 1;
    setPipelineOpen(false);
    setPipelineRun(null);
    setPipelineBusy(false);
    if (!editor) return;
    let cancelled = false;

    void (async () => {
      const response = await fetch(`/api/notes/${noteId}`);
      if (!response.ok || cancelled) return;
      const data = (await response.json()) as NotePayload;
      if (cancelled || noteIdRef.current !== noteId) return;
      editor.commands.setContent(data.note.content);
      setTitle(data.note.title);
      titleRef.current = data.note.title;
      claimsRef.current = data.claims;
      editor.view.dispatch(
        editor.state.tr.setMeta(claimFlagsKey, data.claims),
      );
      setPayload(data);
      setSaveState("saved");
      hydratedNoteId.current = noteId;
      loadingContent.current = false;
      setMinimapRevision((value) => value + 1);
    })();

    return () => {
      cancelled = true;
      loadingContent.current = true;
      hydratedNoteId.current = null;
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
    setMinimapRevision((value) => value + 1);
  }

  function clipLog(text: string, max = 120) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length <= max) return cleaned;
    return `${cleaned.slice(0, max - 1)}…`;
  }

  function updateStep(
    gen: number,
    stepId: string,
    patch: Parameters<typeof patchPipelineStep>[2],
  ) {
    if (gen !== pipelineGenRef.current) return;
    if (patch.status === "running" || patch.status === "failed") {
      pipelineStepRef.current = stepId;
    }
    setPipelineRun((current) =>
      current ? patchPipelineStep(current, stepId, patch) : current,
    );
  }

  function failPipeline(gen: number, stepId: string, message: string) {
    if (gen !== pipelineGenRef.current) return;
    setPipelineRun((current) => {
      if (!current) return current;
      return {
        ...patchPipelineStep(current, stepId, {
          status: "failed",
          detail: message,
        }),
        status: "failed",
      };
    });
  }

  async function runPipeline(
    kind: PipelineKind,
    options?: { skipFactCheck?: boolean },
  ) {
    if (pipelineBusy) return;

    const skipFactCheck = Boolean(options?.skipFactCheck);
    const gen = pipelineGenRef.current + 1;
    pipelineGenRef.current = gen;
    const run = createPipelineRun(kind, { skipFactCheck });
    pipelineStepRef.current = "save";
    setPipelineRun(run);
    // Publish as-is should not flash the fact-check activity rail.
    if (!skipFactCheck) setPipelineOpen(true);
    setPipelineBusy(true);
    if (!skipFactCheck) applyClaims([]);

    try {
      updateStep(gen, "save", {
        status: "running",
        log: "+ saving note",
      });
      await saveNow();
      if (gen !== pipelineGenRef.current) return;
      updateStep(gen, "save", {
        status: "success",
        log: "✓ note saved",
      });

      if (kind !== "fact-check") {
        updateStep(gen, "publish", {
          status: "running",
          log: `+ ${kind === "re-publish" ? "re-publishing" : "publishing"} note`,
        });
        const response = await fetch(`/api/notes/${noteId}/publish`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(
            kind === "re-publish" ? "Re-publish failed" : "Publish failed",
          );
        }
        const { note } = (await response.json()) as { note: NoteDetail };
        if (gen !== pipelineGenRef.current) return;
        setPayload((current) => (current ? { ...current, note } : current));
        updateStep(gen, "publish", {
          status: "success",
          log: "✓ status set to published",
        });
      }

      if (skipFactCheck) {
        updateStep(gen, "complete", {
          status: "success",
          log: "✓ published as-is · no fact-check",
        });
        if (gen === pipelineGenRef.current) {
          setPipelineRun((current) =>
            current ? { ...current, status: "success" } : current,
          );
        }
        toast.success(
          kind === "re-publish" ? "Re-published as-is" : "Published as-is",
        );
        return;
      }

      updateStep(gen, "extract", {
        status: "running",
        detail: "Starting…",
        log: "+ extractClaims",
      });
      const response = await fetch(`/api/notes/${noteId}/fact-check`, {
        method: "POST",
      });
      if (!response.ok || !response.body) {
        throw new Error("Fact-check failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = 0;
      let total = 0;
      let skipped = 0;
      let failedClaims = 0;
      let extractedCount = 0;
      let sawDone = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (gen !== pipelineGenRef.current) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as {
            type: string;
            index?: number;
            total?: number;
            skipped?: number;
            text?: string;
            claimText?: string;
            score?: number;
            check?: boolean;
            claim?: ClaimFlag;
            incomplete?: boolean;
            error?: string;
          };

          if (event.type === "extracting") {
            updateStep(gen, "extract", {
              status: "running",
              detail: "Reading note…",
              log: "reading note text…",
            });
          }

          if (event.type === "extracted" && event.text) {
            extractedCount = event.total ?? extractedCount;
            updateStep(gen, "extract", {
              status: "running",
              detail: `${event.index}/${event.total} claims`,
              log: `[${event.index}/${event.total}] ${clipLog(event.text)}`,
            });
          }

          if (event.type === "scoring") {
            updateStep(gen, "extract", {
              status: "success",
              detail:
                typeof event.total === "number"
                  ? `${event.total} claim${event.total === 1 ? "" : "s"}`
                  : undefined,
              log:
                typeof event.total === "number"
                  ? `✓ extracted ${event.total} claims`
                  : "✓ extract done",
            });
            updateStep(gen, "score", {
              status: "running",
              detail:
                typeof event.total === "number"
                  ? `gpt-6-luna · ${event.total}`
                  : "gpt-6-luna…",
              log: "+ OpenAI Decisions gpt-6-luna (likely-wrong > 0.8)",
            });
          }

          if (event.type === "scored" && event.text && typeof event.score === "number") {
            const scoreLabel = event.score.toFixed(2);
            const gate = event.check ? "PASS" : "skip";
            updateStep(gen, "score", {
              status: "running",
              detail: `${event.index}/${event.total} scored`,
              log: `[${event.index}/${event.total}] ${scoreLabel} ${gate}  ${clipLog(event.text)}`,
            });
          }

          if (event.type === "start") {
            total = event.total ?? 0;
            skipped = event.skipped ?? 0;
            updateStep(gen, "score", {
              status: "success",
              detail:
                skipped > 0
                  ? `Skipped ${skipped} likely-correct`
                  : "All claims look suspicious",
              log: `✓ ${total} likely-wrong · ${skipped} skipped`,
            });
            if (total === 0) {
              updateStep(gen, "web", {
                status: "skipped",
                detail: skipped > 0 ? "Nothing likely-wrong" : "No claims",
                log: "no web checks required",
              });
            } else {
              updateStep(gen, "web", {
                status: "running",
                detail: `0 of ${total}`,
                log: `+ judgeClaim × ${total}`,
              });
            }
          }

          if (event.type === "checking" && event.text) {
            const scoreLabel =
              typeof event.score === "number"
                ? event.score.toFixed(2)
                : "?";
            updateStep(gen, "web", {
              status: "running",
              log: `→ searching  (${scoreLabel})  ${clipLog(event.text)}`,
            });
          }

          if (event.type === "claim" && event.claim) {
            completed += 1;
            applyClaims([...claimsRef.current, event.claim]);
            updateStep(gen, "web", {
              status: "running",
              detail: `${completed} of ${total}`,
              log: `✓ ${event.claim.verdict}  ${clipLog(event.claim.claimText)}`,
            });
          }

          if (event.type === "claim_error") {
            completed += 1;
            failedClaims += 1;
            updateStep(gen, "web", {
              status: "running",
              detail: `${completed} of ${total} · ${failedClaims} failed`,
              log: `✗ ${event.error ?? "failed"}  ${clipLog(event.claimText ?? "")}`,
            });
          }

          if (event.type === "done") {
            sawDone = true;
            const incomplete = Boolean(event.incomplete);
            setPayload((current) =>
              current
                ? {
                    ...current,
                    note: {
                      ...current.note,
                      factCheckIncomplete: incomplete,
                    },
                  }
                : current,
            );
            if (total > 0) {
              updateStep(gen, "web", {
                status: incomplete ? "failed" : "success",
                detail: incomplete
                  ? `${failedClaims} claim${failedClaims === 1 ? "" : "s"} failed`
                  : `${total} checked`,
                log: incomplete
                  ? `✗ web check incomplete (${failedClaims} failed)`
                  : `✓ web check complete (${total})`,
              });
            }
            if (incomplete) {
              updateStep(gen, "complete", {
                status: "failed",
                detail: "Fact-check incomplete",
                log: "pipeline failed",
              });
              if (gen === pipelineGenRef.current) {
                setPipelineRun((current) =>
                  current ? { ...current, status: "failed" } : current,
                );
              }
            } else {
              updateStep(gen, "complete", {
                status: "success",
                log:
                  extractedCount > 0
                    ? `✓ done · ${total} web · ${skipped} skipped`
                    : "✓ done",
              });
              if (gen === pipelineGenRef.current) {
                setPipelineRun((current) =>
                  current ? { ...current, status: "success" } : current,
                );
              }
            }
          }

          if (event.type === "error") {
            throw new Error(event.error ?? "Fact-check failed");
          }
        }
      }

      if (!sawDone) {
        throw new Error("Fact-check ended early");
      }
    } catch (error) {
      if (gen !== pipelineGenRef.current) return;
      const message =
        error instanceof Error ? error.message : "Pipeline failed";
      const stepId = pipelineStepRef.current || "complete";
      failPipeline(gen, stepId, message);
      toast.error(message);
      if (stepId !== "publish" && stepId !== "save") {
        setPayload((current) =>
          current
            ? {
                ...current,
                note: { ...current.note, factCheckIncomplete: true },
              }
            : current,
        );
      }
    } finally {
      if (gen === pipelineGenRef.current) setPipelineBusy(false);
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
      <div className="grid h-dvh flex-1 place-items-center text-xs text-muted-foreground md:h-screen">
        Loading note…
      </div>
    );
  }

  const analysisLength = documentToText(editor.getJSON(), {
    skipCode: true,
  }).length;

  const publishKind: PipelineKind =
    payload.note.status === "published" ? "re-publish" : "publish";

  return (
    <div className="flex min-w-0 flex-1">
      <main className="relative flex h-dvh min-w-0 flex-1 flex-col md:h-screen">
        <header className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2 sm:h-14 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-0">
          <div className="flex min-w-0 items-center gap-2">
            {sidebarCollapsed ? (
              <button
                className="icon-button shrink-0"
                onClick={onOpenSidebar}
                aria-label="Open sidebar"
              >
                <PanelLeftOpen size={16} />
              </button>
            ) : null}
            <span className="truncate text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {payload.note.status}
              {payload.note.publishedAt ? (
                <span className="normal-case tracking-normal opacity-70">
                  {" · "}
                  {formatStamp(payload.note.publishedAt)}
                </span>
              ) : null}
            </span>
            {payload.note.editedSincePublish ? (
              <span className="hidden truncate text-[11px] text-amber-300/80 sm:inline">
                Edited since publish · {formatStamp(payload.note.updatedAt)}
              </span>
            ) : null}
            {payload.note.factCheckIncomplete ? (
              <button
                onClick={() => void runPipeline("fact-check")}
                disabled={pipelineBusy}
                className="flex min-w-0 items-center gap-1 truncate text-[11px] text-amber-300/80"
              >
                <AlertCircle size={12} className="shrink-0" />
                <span className="truncate">Retry fact-check</span>
              </button>
            ) : null}
            <span className="ml-auto shrink-0 text-[11px] text-[#666] sm:hidden">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                  ? "Failed"
                  : "Saved"}
            </span>
          </div>

          <div className="ml-auto flex items-center justify-end gap-1.5 overflow-x-auto sm:gap-2">
            <span className="mr-1 hidden shrink-0 text-[11px] text-[#666] sm:inline">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                  ? "Save failed"
                  : "Saved"}
            </span>
            <button
              onClick={() => {
                if (!readOnly) void saveNow();
                setReadOnly((current) => !current);
              }}
              className="topbar-button"
              aria-pressed={readOnly}
              aria-label={readOnly ? "Edit" : "Read-only"}
            >
              {readOnly ? <Pencil size={13} /> : <BookOpen size={13} />}
              <span className="topbar-label">{readOnly ? "Edit" : "Read-only"}</span>
            </button>
            <button
              onClick={() => void runPipeline("fact-check")}
              disabled={pipelineBusy}
              className="topbar-button"
              aria-label="Fact-check"
            >
              {pipelineBusy && pipelineRun?.kind === "fact-check" ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <ScanSearch size={13} />
              )}
              <span className="topbar-label">Fact-check</span>
            </button>
            <button
              onClick={() => setPublishDialogOpen(true)}
              disabled={pipelineBusy}
              className="topbar-button solid"
              aria-label={
                payload.note.status === "published" ? "Re-publish" : "Publish"
              }
            >
              {pipelineBusy && pipelineRun?.kind !== "fact-check" ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : null}
              <span>
                {payload.note.status === "published" ? "Re-publish" : "Publish"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPipelineOpen((open) => !open)}
              className="icon-button relative shrink-0"
              aria-label={pipelineOpen ? "Close activity" : "Open activity"}
              aria-pressed={pipelineOpen}
            >
              <PanelRightOpen size={16} />
              {pipelineBusy ? (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-foreground" />
              ) : null}
            </button>
          </div>
        </header>
        {readOnly ? null : <FormattingToolbar editor={editor} />}

        <div className="relative flex min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="min-w-0 flex-1 overflow-y-auto"
            onScroll={() => {
              if (hovered) setHovered(null);
            }}
          >
            <article
              ref={contentRef}
              className="w-full px-4 pb-24 pt-6 sm:px-14 sm:pb-32 sm:pt-10 lg:px-20"
            >
            <input
              value={title}
              readOnly={readOnly}
              onChange={(event) => {
                const next = event.target.value;
                setTitle(next);
                titleRef.current = next;
                onTitleChange(noteId, next.trim() || "Untitled");
                scheduleSave();
              }}
              onBlur={() => {
                if (!title.trim()) {
                  setTitle("Untitled");
                  titleRef.current = "Untitled";
                  onTitleChange(noteId, "Untitled");
                  scheduleSave();
                }
              }}
              className={`mb-3 w-full bg-transparent text-[1.75rem] font-semibold tracking-[-0.035em] outline-none placeholder:text-[#444] sm:text-4xl ${
                readOnly ? "cursor-default caret-transparent" : ""
              }`}
              placeholder="Untitled"
              aria-label="Note title"
            />

            <div
              onMouseOver={(event) => {
                if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                const target = (
                  event.target as HTMLElement
                ).closest<HTMLElement>("[data-claim-id]");
                const claim = claimsRef.current.find(
                  (item) => item.id === target?.dataset.claimId,
                );
                if (claim && target) {
                  const rect = target.getBoundingClientRect();
                  setHovered({
                    claim,
                    x: Math.min(rect.left, window.innerWidth - 360),
                    // Overlap the claim slightly so the pointer never crosses a dead gap.
                    y: rect.bottom - 4,
                  });
                  return;
                }
                // Grace period to reach the fixed tooltip (and its top hit pad).
                hoverTimer.current = window.setTimeout(
                  () => setHovered(null),
                  400,
                );
              }}
              onMouseLeave={() => {
                hoverTimer.current = window.setTimeout(
                  () => setHovered(null),
                  400,
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
                    <LoaderCircle
                      size={13}
                      className="animate-spin text-muted-foreground"
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={gapsLoading || analysisLength < 500}
                    onClick={() => void findGaps()}
                  >
                    {payload.checklist.length
                      ? "Analyze again"
                      : "Analyze gaps"}
                  </Button>
                </div>
                {analysisLength < 500 ? (
                  <p className="text-xs text-muted-foreground">
                    Write {500 - analysisLength} more non-code characters to
                    unlock gap analysis.
                  </p>
                ) : null}
                {analysisLength >= 500 &&
                !gapsLoading &&
                payload.checklist.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 size={15} />
                    {gapsMessage ||
                      "Analyze this learning note when you’re ready."}
                  </p>
                ) : null}
                {gapsMessage && payload.checklist.length > 0 ? (
                  <p className="mb-4 text-xs text-muted-foreground">
                    {gapsMessage}
                  </p>
                ) : null}
                <div className="flex flex-col gap-3">
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
                        aria-label={
                          item.ticked ? "Mark incomplete" : "Complete"
                        }
                      >
                        {item.ticked ? <Check size={11} /> : null}
                      </button>
                      <span
                        className={
                          item.ticked
                            ? "text-muted-foreground line-through"
                            : undefined
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
          {minimapEnabled ? (
            <EditorMinimap
              scrollRef={scrollRef}
              contentRef={contentRef}
              revision={minimapRevision}
            />
          ) : null}
        </div>

        {editor ? <InlineChat editor={editor} noteId={noteId} /> : null}

        {hovered ? (
          <aside
            className="fixed z-50 w-[min(20rem,calc(100vw-1.5rem))] pt-2"
            style={{ left: hovered.x, top: hovered.y }}
            onMouseEnter={() => {
              if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
            }}
            onMouseLeave={() => {
              hoverTimer.current = window.setTimeout(
                () => setHovered(null),
                200,
              );
            }}
          >
            <div className="border border-[#333] bg-[#111] p-4 shadow-2xl">
              <p className="mb-2 text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
                {hovered.claim.stale ? "Stale result" : hovered.claim.verdict}
              </p>
              <p className="text-xs leading-5 text-[#ddd]">
                {hovered.claim.reason}
              </p>
              {hovered.claim.sources.length ? (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                  {hovered.claim.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[13px] text-muted-foreground underline decoration-[#555] underline-offset-2 hover:text-foreground"
                    >
                      {source.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </main>

      <ActivityPipeline
        open={pipelineOpen}
        run={pipelineRun}
        onClose={() => setPipelineOpen(false)}
      />

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {payload.note.status === "published" ? "Re-publish" : "Publish"}?
            </DialogTitle>
            <DialogDescription>
              Run the fact-checker, or save the note as published without
              checking claims.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={pipelineBusy}
              onClick={() => {
                setPublishDialogOpen(false);
                void runPipeline(publishKind);
              }}
            >
              Run fact-check
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={pipelineBusy}
              onClick={() => {
                setPublishDialogOpen(false);
                void runPipeline(publishKind, { skipFactCheck: true });
              }}
            >
              {payload.note.status === "published"
                ? "Re-publish as-is"
                : "Publish as-is"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setPublishDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
