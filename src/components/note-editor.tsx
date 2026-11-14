"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
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
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { noteToasts } from "@/lib/toast-messages";
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
import {
  InlineChat,
  type InlineChatSeed,
} from "@/components/inline-chat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  CLAIM_HIGHLIGHTS_CHANGED_EVENT,
  CONTENT_WIDTH_CHANGED_EVENT,
  FONT_FAMILY_CHANGED_EVENT,
  FONT_SIZE_CHANGED_EVENT,
  LINE_HEIGHT_CHANGED_EVENT,
  MINIMAP_CHANGED_EVENT,
  SPELLCHECK_CHANGED_EVENT,
  TOOLBAR_CHANGED_EVENT,
  readClaimHighlights,
  readContentWidth,
  readFontFamily,
  readFontSize,
  readLineHeight,
  readMinimapEnabled,
  readSpellcheckEnabled,
  readToolbarEnabled,
  type ClaimHighlightsOption,
  type ContentWidthOption,
  type FontFamilyOption,
  type FontSizeOption,
  type LineHeightOption,
} from "@/lib/editor-preferences";
import { markdownTableToHtml } from "@/lib/markdown-table";
import type {
  ChecklistItem,
  NotePayload,
  NoteDetailResponse,
} from "@/lib/types";

const lowlight = createLowlight(common);

function insertHtml(view: EditorView, html: string) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(
    holder,
  );
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
}

async function insertUploadedImage(
  view: EditorView,
  file: File,
  pos?: number,
) {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  if (!response.ok) {
    toast.error(noteToasts.imageUploadFailed);
    return;
  }
  const data = (await response.json()) as { url?: string };
  if (!data.url) {
    toast.error(noteToasts.imageUploadFailed);
    return;
  }
  const node = imageType.create({ src: data.url });
  const tr =
    typeof pos === "number"
      ? view.state.tr.insert(pos, node)
      : view.state.tr.replaceSelectionWith(node);
  view.dispatch(tr.scrollIntoView());
}

function formatStamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function emptyNotePayload(noteId: string, title = "Untitled"): NotePayload {
  return {
    note: {
      id: noteId,
      directoryId: null,
      title,
      kind: "writing",
      status: "draft",
      updatedAt: new Date().toISOString(),
      content: { type: "doc", content: [{ type: "paragraph" }] },
      plainText: "",
      visualize: null,
      editedSincePublish: false,
      factCheckIncomplete: false,
      publishedAt: null,
    },
    claims: [],
    checklist: [],
  };
}

export function NoteEditor({
  noteId,
  fresh = false,
  initialTitle,
  sidebarCollapsed,
  onOpenSidebar,
  onTreeChanged,
  onTitleChange,
}: {
  noteId: string;
  fresh?: boolean;
  initialTitle?: string;
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
  onTreeChanged: () => Promise<void>;
  onTitleChange: (noteId: string, title: string) => void;
}) {
  const shellTitle = initialTitle?.trim() || "Untitled";
  const [payload, setPayload] = useState<NotePayload | null>(() =>
    fresh ? emptyNotePayload(noteId, shellTitle) : null,
  );
  const [title, setTitle] = useState(fresh ? shellTitle : "");
  const [ready, setReady] = useState(fresh);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsMessage, setGapsMessage] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [hovered, setHovered] = useState<{
    claim: ClaimFlag;
    x: number;
    y: number;
  } | null>(null);
  const [inlineChatSeed, setInlineChatSeed] = useState<InlineChatSeed | null>(
    null,
  );
  const saveTimer = useRef<number | null>(null);
  const titleRef = useRef(title);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const noteIdRef = useRef(noteId);
  const claimsRef = useRef<ClaimFlag[]>([]);
  const pipelineStepRef = useRef("save");
  const pipelineGenRef = useRef(0);
  const loadingContent = useRef(true);
  const hydratedNoteId = useRef<string | null>(null);
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);
  const minimapTimer = useRef<number | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const [minimapRevision, setMinimapRevision] = useState(0);
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [fontSize, setFontSize] = useState<FontSizeOption>("md");
  const [lineHeight, setLineHeight] = useState<LineHeightOption>("default");
  const [contentWidth, setContentWidth] = useState<ContentWidthOption>("wide");
  const [toolbarEnabled, setToolbarEnabled] = useState(true);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);
  const [fontFamily, setFontFamily] = useState<FontFamilyOption>("sf-pro");
  const [claimHighlights, setClaimHighlights] =
    useState<ClaimHighlightsOption>("strong");

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
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
    setLineHeight(readLineHeight());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ value: LineHeightOption }>).detail;
      setLineHeight(detail?.value ?? readLineHeight());
    }
    window.addEventListener(LINE_HEIGHT_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(LINE_HEIGHT_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    setContentWidth(readContentWidth());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ value: ContentWidthOption }>)
        .detail;
      setContentWidth(detail?.value ?? readContentWidth());
    }
    window.addEventListener(CONTENT_WIDTH_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(CONTENT_WIDTH_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    setToolbarEnabled(readToolbarEnabled());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setToolbarEnabled(detail?.enabled ?? readToolbarEnabled());
    }
    window.addEventListener(TOOLBAR_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TOOLBAR_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    setSpellcheckEnabled(readSpellcheckEnabled());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      setSpellcheckEnabled(detail?.enabled ?? readSpellcheckEnabled());
    }
    window.addEventListener(SPELLCHECK_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(SPELLCHECK_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    setFontFamily(readFontFamily());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ value: FontFamilyOption }>).detail;
      setFontFamily(detail?.value ?? readFontFamily());
    }
    window.addEventListener(FONT_FAMILY_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(FONT_FAMILY_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    setClaimHighlights(readClaimHighlights());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ value: ClaimHighlightsOption }>)
        .detail;
      setClaimHighlights(detail?.value ?? readClaimHighlights());
    }
    window.addEventListener(CLAIM_HIGHLIGHTS_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(CLAIM_HIGHLIGHTS_CHANGED_EVENT, onChange);
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
        heading: { levels: [1, 2, 3, 4, 5, 6] },
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
      TableKit.configure({
        table: { resizable: true },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({
        allowBase64: false,
        resize: {
          enabled: true,
          directions: ["left", "right", "bottom-left", "bottom-right"],
          minWidth: 80,
          minHeight: 40,
          alwaysPreserveAspectRatio: true,
        },
        HTMLAttributes: {
          class: "learning-editor-image",
        },
      }),
      ClaimFlags,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class: "learning-editor",
        spellcheck: "true",
        "data-font-size": "md",
        "data-font-family": "sf-pro",
        "data-line-height": "default",
        "data-claim-highlights": "strong",
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith("image/"));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (!file || !view.state.schema.nodes.image) return false;
          event.preventDefault();
          void insertUploadedImage(view, file);
          return true;
        }

        const plain = event.clipboardData?.getData("text/plain") ?? "";
        const clipboardHtml = event.clipboardData?.getData("text/html") ?? "";
        if (!clipboardHtml.includes("<table") && view.state.schema.nodes.table) {
          const tableHtml = markdownTableToHtml(plain);
          if (tableHtml) {
            event.preventDefault();
            insertHtml(view, tableHtml);
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith("image/"),
        );
        if (!file || !view.state.schema.nodes.image) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        void insertUploadedImage(view, file, coords?.pos);
        return true;
      },
    },
    onUpdate: () => {
      if (!loadingContent.current) scheduleSave();
      scheduleMinimapRefresh();
    },
  });

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.setAttribute("data-font-size", fontSize);
    dom.setAttribute("data-font-family", fontFamily);
    dom.setAttribute("data-line-height", lineHeight);
    dom.setAttribute("data-claim-highlights", claimHighlights);
    dom.setAttribute("spellcheck", spellcheckEnabled ? "true" : "false");
    setMinimapRevision((value) => value + 1);
  }, [
    editor,
    fontSize,
    fontFamily,
    lineHeight,
    claimHighlights,
    spellcheckEnabled,
    contentWidth,
  ]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setReadOnly(false);
    }
  }, []);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!editor || loadingContent.current) return false;
    const targetNoteId = noteIdRef.current;
    if (hydratedNoteId.current !== targetNoteId) return false;
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
    if (!response.ok) {
      if (noteIdRef.current === targetNoteId) setSaveState("error");
      return false;
    }
    const data = (await response.json()) as NoteDetailResponse;
    if (noteIdRef.current !== targetNoteId) return true;
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
    return true;
  }, [editor, onTitleChange]);

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

  function scheduleMinimapRefresh() {
    if (minimapTimer.current) window.clearTimeout(minimapTimer.current);
    minimapTimer.current = window.setTimeout(() => {
      setMinimapRevision((value) => value + 1);
    }, 200);
  }

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    loadingContent.current = true;
    hydratedNoteId.current = null;
    noteIdRef.current = noteId;
    pipelineGenRef.current += 1;
    setPipelineOpen(false);
    setPipelineRun(null);
    setPipelineBusy(false);
    setLoadError(false);
    setReady(fresh);
    if (fresh) {
      setTitle(shellTitle);
      titleRef.current = shellTitle;
      claimsRef.current = [];
      setPayload(emptyNotePayload(noteId, shellTitle));
    } else {
      setPayload(null);
      setTitle("");
      titleRef.current = "";
      claimsRef.current = [];
    }
    if (!editor) return;

    if (fresh) {
      editor.commands.setContent({
        type: "doc",
        content: [{ type: "paragraph" }],
      });
      editor.view.dispatch(editor.state.tr.setMeta(claimFlagsKey, []));
      hydratedNoteId.current = noteId;
      loadingContent.current = false;
      setSaveState("saved");
      setReady(true);
      setMinimapRevision((value) => value + 1);
      return () => {
        void saveNowRef.current();
        loadingContent.current = true;
        hydratedNoteId.current = null;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
      };
    }

    let cancelled = false;

    void (async () => {
      const response = await fetch(`/api/notes/${noteId}`);
      if (cancelled || noteIdRef.current !== noteId) return;
      if (!response.ok) {
        setLoadError(true);
        setReady(true);
        return;
      }
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
      setReady(true);
      setMinimapRevision((value) => value + 1);
    })();

    return () => {
      cancelled = true;
      void saveNowRef.current();
      loadingContent.current = true;
      hydratedNoteId.current = null;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [editor, fresh, noteId]);

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
    if (!skipFactCheck) setPipelineOpen(true);
    setPipelineBusy(true);
    if (!skipFactCheck) applyClaims([]);

    try {
      updateStep(gen, "save", {
        status: "running",
        log: "+ saving note",
      });
      const saved = await saveNow();
      if (gen !== pipelineGenRef.current) return;
      if (!saved) {
        throw new Error("Save failed");
      }
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
        const { note } = (await response.json()) as NoteDetailResponse;
        if (gen !== pipelineGenRef.current) return;
        setPayload((current) => (current ? { ...current, note } : current));
        await onTreeChanged();
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
          kind === "re-publish"
            ? noteToasts.republishedAsIs
            : noteToasts.publishedAsIs,
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
      let factCheckIncomplete = false;

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
              log: "+ OpenAI Decisions gpt-6-luna (likely-wrong > 0.7)",
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
            factCheckIncomplete = Boolean(event.incomplete);
            setPayload((current) =>
              current
                ? {
                    ...current,
                    note: {
                      ...current.note,
                      factCheckIncomplete,
                    },
                  }
                : current,
            );
            if (total > 0) {
              updateStep(gen, "web", {
                status: factCheckIncomplete ? "failed" : "success",
                detail: factCheckIncomplete
                  ? `${failedClaims} claim${failedClaims === 1 ? "" : "s"} failed`
                  : `${total} checked`,
                log: factCheckIncomplete
                  ? `✗ web check incomplete (${failedClaims} failed)`
                  : `✓ web check complete (${total})`,
              });
            }
            if (factCheckIncomplete) {
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
            } else if (kind === "fact-check") {
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

      if (kind !== "fact-check" && !factCheckIncomplete) {
        updateStep(gen, "gaps", {
          status: "running",
          log: "+ analyzing gaps",
        });
        setGapsLoading(true);
        try {
          const gapsResponse = await fetch(`/api/notes/${noteId}/gaps`, {
            method: "POST",
          });
          if (gen !== pipelineGenRef.current) return;
          if (!gapsResponse.ok) {
            throw new Error("Gap analysis failed");
          }
          const gapsData = (await gapsResponse.json()) as {
            checklist: ChecklistItem[];
            message?: string | null;
            skipped?: string | null;
          };
          setPayload((current) =>
            current ? { ...current, checklist: gapsData.checklist } : current,
          );
          setGapsMessage(gapsData.message ?? "");
          updateStep(gen, "gaps", {
            status: gapsData.skipped ? "skipped" : "success",
            detail: gapsData.skipped
              ? gapsData.skipped.replaceAll("_", " ")
              : `${gapsData.checklist.length} item${gapsData.checklist.length === 1 ? "" : "s"}`,
            log: gapsData.message
              ? `✓ ${gapsData.message}`
              : gapsData.skipped
                ? `skipped · ${gapsData.skipped}`
                : `✓ gaps updated (${gapsData.checklist.length})`,
          });
        } finally {
          if (gen === pipelineGenRef.current) setGapsLoading(false);
        }
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
    } catch (error) {
      if (gen !== pipelineGenRef.current) return;
      const message =
        error instanceof Error ? error.message : noteToasts.pipelineFailed;
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
      if (!response.ok) {
        toast.error(noteToasts.gapAnalysisFailed);
        return;
      }
      const data = (await response.json()) as {
        checklist: ChecklistItem[];
        message?: string | null;
      };
      setPayload((current) =>
        current ? { ...current, checklist: data.checklist } : current,
      );
      setGapsMessage(data.message ?? "");
    } catch {
      toast.error(noteToasts.gapAnalysisFailed);
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
    const response = await fetch(`/api/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticked }),
    });
    if (!response.ok) {
      setPayload((current) =>
        current
          ? {
              ...current,
              checklist: current.checklist.map((entry) =>
                entry.id === item.id ? item : entry,
              ),
            }
          : current,
      );
      toast.error(noteToasts.gapUpdateFailed);
    }
  }

  async function deleteChecklist(item: ChecklistItem) {
    setPayload((current) =>
      current
        ? {
            ...current,
            checklist: current.checklist.filter((entry) => entry.id !== item.id),
          }
        : current,
    );
    const response = await fetch(`/api/checklist/${item.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setPayload((current) =>
        current
          ? { ...current, checklist: [...current.checklist, item] }
          : current,
      );
      toast.error(noteToasts.gapDeleteFailed);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 px-6">
          {sidebarCollapsed ? (
            <button
              className="icon-button absolute left-3 top-3 sm:left-4 sm:top-4"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          ) : null}
          <AlertCircle size={20} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Could not load note</p>
        </main>
      </div>
    );
  }

  if (!editor || !ready || !payload) {
    return (
      <NoteEditorSkeleton
        sidebarCollapsed={sidebarCollapsed}
        onOpenSidebar={onOpenSidebar}
      />
    );
  }

  const analysisLength = documentToText(editor.getJSON(), {
    skipCode: true,
  }).length;

  const publishKind: PipelineKind =
    payload.note.status === "published" ? "re-publish" : "publish";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
              <span className="hidden truncate text-[11px] text-amber-700 dark:text-amber-300 sm:inline">
                Edited since publish · {formatStamp(payload.note.updatedAt)}
              </span>
            ) : null}
            {payload.note.factCheckIncomplete ? (
              <button
                onClick={() => void runPipeline("fact-check")}
                disabled={pipelineBusy}
                className="flex min-w-0 items-center gap-1 truncate text-[11px] text-amber-700 dark:text-amber-300"
              >
                <AlertCircle size={12} className="shrink-0" />
                <span className="truncate">Retry fact-check</span>
              </button>
            ) : null}
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground sm:hidden">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                  ? "Failed"
                  : "Saved"}
            </span>
          </div>

          <div className="ml-auto flex items-center justify-end gap-1.5 overflow-x-auto sm:gap-2">
            <span className="mr-1 hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
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
        {readOnly || !toolbarEnabled ? null : (
          <FormattingToolbar editor={editor} />
        )}

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
              data-content-width={contentWidth}
              className="learning-note-article w-full px-4 pb-24 pt-6 sm:px-14 sm:pb-32 sm:pt-10 lg:px-20"
            >
            <textarea
              ref={titleInputRef}
              rows={1}
              value={title}
              readOnly={readOnly}
              onChange={(event) => {
                const next = event.target.value.replace(/\n/g, " ");
                setTitle(next);
                titleRef.current = next;
                onTitleChange(noteId, next.trim() || "Untitled");
                scheduleSave();
                scheduleMinimapRefresh();
              }}
              onBlur={() => {
                if (!title.trim()) {
                  setTitle("Untitled");
                  titleRef.current = "Untitled";
                  onTitleChange(noteId, "Untitled");
                  scheduleSave();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  editor.chain().focus("start").run();
                }
              }}
              className={`mb-3 w-full resize-none overflow-hidden bg-transparent text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] outline-none placeholder:text-muted-foreground sm:text-4xl ${
                readOnly ? "cursor-default caret-transparent" : ""
              }`}
              placeholder="Untitled"
              aria-label="Note title"
            />

            <div
              onMouseOver={(event) => {
                if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                if (claimHighlights === "off") {
                  setHovered(null);
                  return;
                }
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
                    y: rect.bottom - 4,
                  });
                  return;
                }
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
                    <div
                      key={item.id}
                      className="group flex items-start gap-3 text-sm leading-6"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleChecklist(item)}
                        className={`mt-1 grid h-4 w-4 shrink-0 place-items-center border ${
                          item.ticked
                            ? "border-theme-accent bg-theme-accent text-white"
                            : "border-foreground/35 hover:border-theme-accent"
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
                            ? "min-w-0 flex-1 text-muted-foreground line-through"
                            : "min-w-0 flex-1"
                        }
                      >
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteChecklist(item)}
                        className="mt-0.5 shrink-0 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Delete gap item"
                      >
                        <X size={14} />
                      </button>
                    </div>
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

        {editor ? (
          <InlineChat
            editor={editor}
            noteId={noteId}
            seed={inlineChatSeed}
            onSeedConsumed={() => setInlineChatSeed(null)}
          />
        ) : null}

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
            <div className="border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
              <p className="mb-2 text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
                {hovered.claim.stale ? "Stale result" : hovered.claim.verdict}
              </p>
              <p className="text-xs leading-5 text-foreground">
                {hovered.claim.reason}
              </p>
              <button
                type="button"
                className="mt-3 text-left text-[13px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                onClick={() => {
                  const claim = hovered.claim;
                  setInlineChatSeed({
                    text: claim.claimText,
                    top: hovered.y,
                    left: hovered.x,
                  });
                  setHovered(null);
                }}
              >
                Ask in inline chat
              </button>
              {hovered.claim.sources.length ? (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                  {hovered.claim.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[13px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
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
          <DialogFooter className="flex-row gap-2 sm:justify-stretch">
            <Button
              type="button"
              size="sm"
              className="min-w-0 flex-1"
              disabled={pipelineBusy}
              onClick={() => {
                setPublishDialogOpen(false);
                void runPipeline(publishKind);
              }}
            >
              Fact Check + Publish
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 flex-1"
              disabled={pipelineBusy}
              onClick={() => {
                setPublishDialogOpen(false);
                void runPipeline(publishKind, { skipFactCheck: true });
              }}
            >
              Publish as is
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteEditorSkeleton({
  sidebarCollapsed,
  onOpenSidebar,
}: {
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-1"
      aria-busy="true"
      aria-label="Loading note"
    >
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
              draft
            </span>
          </div>
          <div className="ml-auto flex items-center justify-end gap-1.5 overflow-x-auto sm:gap-2">
            <button
              type="button"
              disabled
              className="topbar-button"
              aria-label="Read-only"
            >
              <BookOpen size={13} />
              <span className="topbar-label">Read-only</span>
            </button>
            <button
              type="button"
              disabled
              className="topbar-button"
              aria-label="Fact-check"
            >
              <ScanSearch size={13} />
              <span className="topbar-label">Fact-check</span>
            </button>
            <button
              type="button"
              disabled
              className="topbar-button solid"
              aria-label="Publish"
            >
              <span>Publish</span>
            </button>
            <button
              type="button"
              disabled
              className="icon-button relative shrink-0"
              aria-label="Open activity"
            >
              <PanelRightOpen size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <article className="w-full px-4 pb-24 pt-6 sm:px-14 sm:pb-32 sm:pt-10 lg:px-20">
            <Skeleton className="mb-3 h-9 w-[72%] max-w-xl sm:h-11" />
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[97%]" />
              <Skeleton className="h-3 w-[94%]" />
              <Skeleton className="h-3 w-[88%]" />
              <Skeleton className="h-3 w-[61%]" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="h-3 w-[96%]" />
              <Skeleton className="h-3 w-[91%]" />
              <Skeleton className="h-3 w-[85%]" />
              <Skeleton className="h-3 w-[73%]" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="h-3 w-[93%]" />
              <Skeleton className="h-3 w-[89%]" />
              <Skeleton className="h-3 w-[80%]" />
              <Skeleton className="h-3 w-[54%]" />
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}

