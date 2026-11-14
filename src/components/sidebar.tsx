"use client";

import {
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus2,
  Folder,
  FolderPlus,
  Activity,
  LogOut,
  Pencil,
  PanelLeftClose,
  Search,
  Settings,
  Trash2,
  DiagramFlowHorizontal,
  GraphStar,
} from "lucide-react";
import { ColorSchemeToggle } from "@/components/color-scheme-toggle";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { sidebarToasts } from "@/lib/toast-messages";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { directoryDeleteMatchSchema } from "@/lib/schemas";
import type {
  DirectoryItem,
  NoteKind,
  NoteSummary,
  NoteSummaryResponse,
  TreePayload,
} from "@/lib/types";

const SIDEBAR_WIDTH_KEY = "learning-sidebar-width-v2";
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 340;
const TREE_DRAG_MIME = "application/x-learning-tree-item";
const ROOT_DROP_ID = "__root__";

type TreeDragPayload =
  | { kind: "note"; id: string }
  | { kind: "directory"; id: string };

function parseTreeDragPayload(raw: string): TreeDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as TreeDragPayload;
    if (
      (parsed.kind === "note" || parsed.kind === "directory") &&
      typeof parsed.id === "string"
    ) {
      return parsed;
    }
  } catch {
  }
  return null;
}

function readTreeDrag(event: React.DragEvent): TreeDragPayload | null {
  return (
    parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME)) ??
    parseTreeDragPayload(event.dataTransfer.getData("text/plain"))
  );
}

function readSidebarWidth() {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, raw));
}

type SidebarProps = {
  tree: TreePayload;
  selectedNoteId: string | null;
  onOpenNote: (id: string, options?: { fresh?: boolean }) => void;
  onChanged: (preferredNoteId?: string) => Promise<void>;
  onOptimisticTree: (updater: (tree: TreePayload) => TreePayload) => void;
  onCollapse: () => void;
  onSearch: () => void;
  onKnowledgeGraph: () => void;
  onUsage: () => void;
  onSettings: () => void;
  mobile?: boolean;
};

type EditAction =
  | {
      kind: "directory";
      mode: "create" | "rename";
      parentId: string | null;
      id?: string;
      value: string;
    }
  | {
      kind: "note";
      mode: "create" | "rename";
      directoryId: string | null;
      id?: string;
      value: string;
      noteKind?: NoteKind;
    };

type DeleteAction =
  | { kind: "directory"; id: string; name: string }
  | { kind: "note"; id: string; name: string };

export function Sidebar(props: SidebarProps) {
  const router = useRouter();
  const [editAction, setEditAction] = useState<EditAction | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string | null>(
    null,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = localStorage.getItem("learning-expanded-directories");
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  });
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<TreeDragPayload | null>(
    null,
  );
  const draggingItemRef = useRef<TreeDragPayload | null>(null);
  const dragging = useRef(false);

  function beginTreeDrag(item: TreeDragPayload) {
    draggingItemRef.current = item;
    setDraggingItem(item);
  }

  function endTreeDrag() {
    draggingItemRef.current = null;
    setDraggingItem(null);
    setDropTargetId(null);
  }

  useEffect(() => {
    setWidth(readSidebarWidth());
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
        const next = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
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
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(current));
          return current;
        });
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width],
  );

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(
        "learning-expanded-directories",
        JSON.stringify([...next]),
      );
      return next;
    });
  }

  function toggleOpen(id: string) {
    if (!expanded.has(id)) toggle(id);
  }

  function rollback(previous: TreePayload, message: string) {
    props.onOptimisticTree(() => previous);
    toast.error(message);
  }

  function openDelete(action: DeleteAction) {
    setDeleteAction(action);
    setDeleteConfirmation("");
    setDeleteError("");
  }

  function closeDelete() {
    setDeleteAction(null);
    setDeleteConfirmation("");
    setDeleteError("");
  }

  function descendantDirectoryIds(rootId: string) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const directory of props.tree.directories) {
        if (
          directory.parentId &&
          ids.has(directory.parentId) &&
          !ids.has(directory.id)
        ) {
          ids.add(directory.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  function canDropOnDirectory(
    drag: TreeDragPayload,
    targetDirectoryId: string,
  ) {
    if (drag.kind === "note") {
      const note = props.tree.notes.find((item) => item.id === drag.id);
      return Boolean(note && note.directoryId !== targetDirectoryId);
    }
    if (drag.id === targetDirectoryId) return false;
    const directory = props.tree.directories.find((item) => item.id === drag.id);
    if (!directory || directory.parentId === targetDirectoryId) return false;
    return !descendantDirectoryIds(drag.id).has(targetDirectoryId);
  }

  function canDropOnRoot(drag: TreeDragPayload) {
    if (drag.kind === "note") {
      const note = props.tree.notes.find((item) => item.id === drag.id);
      return Boolean(note && note.directoryId !== null);
    }
    const directory = props.tree.directories.find((item) => item.id === drag.id);
    return Boolean(directory && directory.parentId !== null);
  }

  async function moveTreeItem(
    drag: TreeDragPayload,
    targetDirectoryId: string | null,
  ) {
    if (targetDirectoryId === null) {
      if (!canDropOnRoot(drag)) return;
      const previous = props.tree;

      if (drag.kind === "note") {
        props.onOptimisticTree((tree) => ({
          ...tree,
          notes: tree.notes.map((note) =>
            note.id === drag.id ? { ...note, directoryId: null } : note,
          ),
        }));
        try {
          const response = await fetch(`/api/notes/${drag.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directoryId: null }),
          });
          if (!response.ok) throw new Error();
        } catch {
          rollback(previous, sidebarToasts.moveNoteFailed);
        }
        return;
      }

      props.onOptimisticTree((tree) => ({
        ...tree,
        directories: tree.directories.map((directory) =>
          directory.id === drag.id
            ? { ...directory, parentId: null }
            : directory,
        ),
      }));
      try {
        const response = await fetch(`/api/directories/${drag.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: null }),
        });
        if (!response.ok) throw new Error();
      } catch {
        rollback(previous, sidebarToasts.moveDirectoryFailed);
      }
      return;
    }

    if (!canDropOnDirectory(drag, targetDirectoryId)) return;
    const previous = props.tree;
    toggleOpen(targetDirectoryId);

    if (drag.kind === "note") {
      props.onOptimisticTree((tree) => ({
        ...tree,
        notes: tree.notes.map((note) =>
          note.id === drag.id
            ? { ...note, directoryId: targetDirectoryId }
            : note,
        ),
      }));
      try {
        const response = await fetch(`/api/notes/${drag.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directoryId: targetDirectoryId }),
        });
        if (!response.ok) throw new Error();
      } catch {
        rollback(previous, sidebarToasts.moveNoteFailed);
      }
      return;
    }

    props.onOptimisticTree((tree) => ({
      ...tree,
      directories: tree.directories.map((directory) =>
        directory.id === drag.id
          ? { ...directory, parentId: targetDirectoryId }
          : directory,
      ),
    }));
    try {
      const response = await fetch(`/api/directories/${drag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: targetDirectoryId }),
      });
      if (!response.ok) throw new Error();
    } catch {
      rollback(previous, sidebarToasts.moveDirectoryFailed);
    }
  }

  async function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteAction || submitting) return;

    if (deleteAction.kind === "directory") {
      const parsed = directoryDeleteMatchSchema(deleteAction.name).safeParse({
        confirmation: deleteConfirmation,
      });
      if (!parsed.success) {
        setDeleteError(
          parsed.error.issues[0]?.message ?? "Type the directory name",
        );
        return;
      }
    }

    const previous = props.tree;
    const action = deleteAction;
    const confirmation = deleteConfirmation;
    setSubmitting(true);

    if (action.kind === "note") {
      props.onOptimisticTree((tree) => ({
        ...tree,
        notes: tree.notes.filter((note) => note.id !== action.id),
      }));
    } else {
      const removed = descendantDirectoryIds(action.id);
      if (selectedDirectoryId && removed.has(selectedDirectoryId)) {
        setSelectedDirectoryId(null);
      }
      props.onOptimisticTree((tree) => ({
        directories: tree.directories.filter(
          (directory) => !removed.has(directory.id),
        ),
        notes: tree.notes.filter(
          (note) => !note.directoryId || !removed.has(note.directoryId),
        ),
      }));
    }

    const endpoint =
      action.kind === "note"
        ? `/api/notes/${action.id}`
        : `/api/directories/${action.id}`;
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers:
          action.kind === "directory"
            ? { "Content-Type": "application/json" }
            : undefined,
        body:
          action.kind === "directory"
            ? JSON.stringify({ confirmation })
            : undefined,
      });
      if (!response.ok) {
        rollback(previous, sidebarToasts.trashFailed);
        return;
      }
      closeDelete();
      toast.success(sidebarToasts.movedToTrash);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAction || !editAction.value.trim()) return;
    setSubmitting(true);
    const previous = props.tree;

    try {
      if (editAction.kind === "directory" && editAction.mode === "create") {
        const tempId = crypto.randomUUID();
        const optimistic: DirectoryItem = {
          id: tempId,
          name: editAction.value.trim(),
          parentId: editAction.parentId,
        };
        props.onOptimisticTree((tree) => ({
          ...tree,
          directories: [...tree.directories, optimistic],
        }));
        if (editAction.parentId) toggleOpen(editAction.parentId);

        const response = await fetch("/api/directories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editAction.value,
            parentId: editAction.parentId,
          }),
        });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as {
          directory: DirectoryItem;
        };
        props.onOptimisticTree((tree) => ({
          ...tree,
          directories: tree.directories.map((directory) =>
            directory.id === tempId ? data.directory : directory,
          ),
        }));
      }

      if (editAction.kind === "note" && editAction.mode === "create") {
        const noteKind = editAction.noteKind ?? "writing";
        const directoryId = editAction.directoryId;
        if (!directoryId) throw new Error("directory required");
        const tempId = crypto.randomUUID();
        const optimistic: NoteSummary = {
          id: tempId,
          directoryId,
          title: editAction.value.trim(),
          kind: noteKind,
          status: "draft",
          updatedAt: new Date().toISOString(),
        };
        props.onOptimisticTree((tree) => ({
          ...tree,
          notes: [...tree.notes, optimistic],
        }));
        toggleOpen(directoryId);

        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directoryId,
            title: editAction.value,
            kind: noteKind,
          }),
        });
        if (!response.ok) throw new Error();
        const { note } = (await response.json()) as NoteSummaryResponse;
        props.onOptimisticTree((tree) => ({
          ...tree,
          notes: tree.notes.map((item) =>
            item.id === tempId
              ? {
                  id: note.id,
                  directoryId: note.directoryId,
                  title: note.title,
                  kind: note.kind ?? noteKind,
                  status: note.status,
                  updatedAt: note.updatedAt,
                }
              : item,
          ),
        }));
        props.onOpenNote(note.id, { fresh: true });
      }

      if (editAction.kind === "directory" && editAction.mode === "rename") {
        props.onOptimisticTree((tree) => ({
          ...tree,
          directories: tree.directories.map((directory) =>
            directory.id === editAction.id
              ? { ...directory, name: editAction.value.trim() }
              : directory,
          ),
        }));
        const response = await fetch(`/api/directories/${editAction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editAction.value }),
        });
        if (!response.ok) throw new Error();
      }

      if (editAction.kind === "note" && editAction.mode === "rename") {
        props.onOptimisticTree((tree) => ({
          ...tree,
          notes: tree.notes.map((note) =>
            note.id === editAction.id
              ? { ...note, title: editAction.value.trim() }
              : note,
          ),
        }));
        const response = await fetch(`/api/notes/${editAction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editAction.value }),
        });
        if (!response.ok) throw new Error();
        window.dispatchEvent(
          new CustomEvent("learning-note-renamed", {
            detail: {
              id: editAction.id,
              title: editAction.value.trim(),
            },
          }),
        );
      }

      setEditAction(null);
    } catch {
      rollback(previous, sidebarToasts.saveChangeFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const roots = useMemo(
    () =>
      props.tree.directories
        .filter((directory) => !directory.parentId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [props.tree.directories],
  );

  const rootNotes = useMemo(
    () =>
      props.tree.notes
        .filter((note) => note.directoryId === null)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [props.tree.notes],
  );

  const currentDirectoryId = useMemo(() => {
    if (
      selectedDirectoryId &&
      props.tree.directories.some((item) => item.id === selectedDirectoryId)
    ) {
      return selectedDirectoryId;
    }
    if (props.selectedNoteId) {
      const note = props.tree.notes.find(
        (item) => item.id === props.selectedNoteId,
      );
      if (note) return note.directoryId;
    }
    return null;
  }, [
    props.selectedNoteId,
    props.tree.directories,
    props.tree.notes,
    selectedDirectoryId,
  ]);

  function startCreateNote(
    directoryId?: string | null,
    noteKind: NoteKind = "writing",
  ) {
    const target = directoryId ?? currentDirectoryId;
    if (!target) {
      toast.error(sidebarToasts.needDirectory);
      setEditAction({
        kind: "directory",
        mode: "create",
        parentId: null,
        value: "",
      });
      return;
    }
    setEditAction({
      kind: "note",
      mode: "create",
      directoryId: target,
      value: noteKind === "visualize" ? "Untitled visualize" : "Untitled",
      noteKind,
    });
  }

  function startCreateDirectory(parentId: string | null = currentDirectoryId) {
    setEditAction({
      kind: "directory",
      mode: "create",
      parentId,
      value: "",
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editAction || deleteAction) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (selectedDirectoryId) {
          const directory = props.tree.directories.find(
            (item) => item.id === selectedDirectoryId,
          );
          if (!directory) return;
          event.preventDefault();
          openDelete({
            kind: "directory",
            id: directory.id,
            name: directory.name,
          });
          return;
        }

        if (props.selectedNoteId) {
          const note = props.tree.notes.find(
            (item) => item.id === props.selectedNoteId,
          );
          if (!note) return;
          event.preventDefault();
          openDelete({
            kind: "note",
            id: note.id,
            name: note.title,
          });
        }
        return;
      }

      if (event.key.toLowerCase() !== "n") return;

      if (!event.ctrlKey || event.metaKey || event.altKey) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) startCreateDirectory(selectedDirectoryId);
      else startCreateNote(currentDirectoryId);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    currentDirectoryId,
    deleteAction,
    editAction,
    props.selectedNoteId,
    props.tree.directories,
    props.tree.notes,
    selectedDirectoryId,
  ]);

  return (
    <aside
      className="relative flex h-dvh w-full shrink-0 flex-col border-r border-border bg-sidebar md:h-screen"
      style={props.mobile ? undefined : { width }}
    >
      {props.mobile ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setWidth((current) => {
              const delta = event.key === "ArrowRight" ? 16 : -16;
              const next = Math.min(
                SIDEBAR_MAX_WIDTH,
                Math.max(SIDEBAR_MIN_WIDTH, current + delta),
              );
              localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
              return next;
            });
          }}
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-theme-accent/25 active:bg-theme-accent/40"
        />
      )}
      <div className="flex h-14 items-center justify-between border-b border-border px-3 sm:px-4">
        <span className="text-xs font-medium uppercase tracking-[0.2em]">
          Scholar
        </span>
        <div className="flex items-center gap-1">
          <ColorSchemeToggle />
          <button
            onClick={props.onCollapse}
            className="icon-button"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <button
        onClick={props.onSearch}
        className="mx-3 mt-3 flex h-10 items-center gap-2 border border-border px-3 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:h-9"
      >
        <Search size={14} />
        Search
        <kbd className="ml-auto hidden font-mono text-[12px] sm:inline">⌘K</kbd>
      </button>

      <button
        onClick={props.onKnowledgeGraph}
        className="mx-3 mt-2 flex h-10 items-center gap-2 border border-border px-3 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:h-9"
      >
        <GraphStar size={14} />
        Knowledge graph
      </button>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-1 flex-col overflow-y-auto px-2 py-4">
            {roots.length || rootNotes.length ? (
              <>
                {roots.map((directory) => (
                  <DirectoryNode
                    key={directory.id}
                    directory={directory}
                    directories={props.tree.directories}
                    notes={props.tree.notes}
                    expanded={expanded}
                    selectedDirectoryId={selectedDirectoryId}
                    selectedNoteId={props.selectedNoteId}
                    dropTargetId={dropTargetId}
                    getDraggingItem={() => draggingItemRef.current}
                    onToggle={toggle}
                    onEnsureExpanded={toggleOpen}
                    onSelectDirectory={setSelectedDirectoryId}
                    onCreateDirectory={(parentId) =>
                      startCreateDirectory(parentId)
                    }
                    onCreateNote={(directoryId) =>
                      startCreateNote(directoryId)
                    }
                    onCreateVisualizeNote={(directoryId) =>
                      startCreateNote(directoryId, "visualize")
                    }
                    onRenameDirectory={(directory) =>
                      setEditAction({
                        kind: "directory",
                        mode: "rename",
                        parentId: directory.parentId,
                        id: directory.id,
                        value: directory.name,
                      })
                    }
                    onRenameNote={(note) =>
                      setEditAction({
                        kind: "note",
                        mode: "rename",
                        directoryId: note.directoryId,
                        id: note.id,
                        value: note.title,
                      })
                    }
                    onDeleteDirectory={(directory) =>
                      openDelete({
                        kind: "directory",
                        id: directory.id,
                        name: directory.name,
                      })
                    }
                    onDeleteNote={(note) =>
                      openDelete({
                        kind: "note",
                        id: note.id,
                        name: note.title,
                      })
                    }
                    onOpenNote={(id) => {
                      setSelectedDirectoryId(null);
                      props.onOpenNote(id);
                    }}
                    onDragItemStart={beginTreeDrag}
                    onDragItemEnd={endTreeDrag}
                    canDropOnDirectory={canDropOnDirectory}
                    onDropTargetChange={setDropTargetId}
                    onDropOnDirectory={moveTreeItem}
                  />
                ))}
                {rootNotes.map((note) => (
                  <TreeNoteRow
                    key={note.id}
                    note={note}
                    selected={props.selectedNoteId === note.id}
                    onOpen={() => {
                      setSelectedDirectoryId(null);
                      props.onOpenNote(note.id);
                    }}
                    onRename={() =>
                      setEditAction({
                        kind: "note",
                        mode: "rename",
                        directoryId: note.directoryId,
                        id: note.id,
                        value: note.title,
                      })
                    }
                    onDelete={() =>
                      openDelete({
                        kind: "note",
                        id: note.id,
                        name: note.title,
                      })
                    }
                    onDragStart={beginTreeDrag}
                    onDragEnd={endTreeDrag}
                  />
                ))}
              </>
            ) : (
              <button
                onClick={() => startCreateDirectory(null)}
                className="flex w-full items-center gap-2 px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <FolderPlus size={14} />
                New directory
              </button>
            )}
            <div
              className={`min-h-8 flex-1 ${
                dropTargetId === ROOT_DROP_ID
                  ? "rounded-sm bg-theme-accent-soft"
                  : ""
              }`}
              onClick={() => setSelectedDirectoryId(null)}
              onDragOver={(event) => {
                const drag = draggingItemRef.current;
                if (!drag || !canDropOnRoot(drag)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropTargetId !== ROOT_DROP_ID) {
                  setDropTargetId(ROOT_DROP_ID);
                }
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  return;
                }
                if (dropTargetId === ROOT_DROP_ID) setDropTargetId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const drag =
                  readTreeDrag(event) ?? draggingItemRef.current;
                setDropTargetId(null);
                if (!drag || !canDropOnRoot(drag)) return;
                void moveTreeItem(drag, null);
              }}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => startCreateNote(currentDirectoryId)}>
            <FilePlus2 size={14} />
            New note
            <kbd className="ml-auto hidden font-mono text-[12px] text-muted-foreground sm:inline">
              ⌃N
            </kbd>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => startCreateNote(currentDirectoryId, "visualize")}
          >
            <DiagramFlowHorizontal size={14} />
            New visualize note
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => startCreateDirectory(selectedDirectoryId)}
          >
            <FolderPlus size={14} />
            New directory
            <kbd className="ml-auto hidden font-mono text-[12px] text-muted-foreground sm:inline">
              ⌃⇧N
            </kbd>
          </ContextMenuItem>
          {selectedDirectoryId ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => startCreateDirectory(null)}>
                <FolderPlus size={14} />
                New root directory
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>

      <div className="border-t border-border p-2">
        <button
          onClick={props.onUsage}
          className="sidebar-row w-full text-muted-foreground hover:text-foreground"
        >
          <Activity size={14} />
          Usage
        </button>
        <button
          onClick={props.onSettings}
          className="sidebar-row w-full text-muted-foreground hover:text-foreground"
        >
          <Settings size={14} />
          Settings
        </button>
        <button
          onClick={() => router.push("/trash")}
          className="sidebar-row w-full text-muted-foreground hover:text-foreground"
        >
          <Trash2 size={14} />
          Trash
        </button>
        <button
          onClick={() => {
            void (async () => {
              try {
                const response = await fetch("/api/auth/logout", {
                  method: "POST",
                });
                if (!response.ok) throw new Error("logout failed");
                router.replace("/login");
                router.refresh();
              } catch {
                toast.error(sidebarToasts.logoutFailed);
              }
            })();
          }}
          className="sidebar-row w-full text-muted-foreground hover:text-foreground"
        >
          <LogOut size={14} />
          Log out
        </button>
      </div>

      <Dialog
        open={Boolean(editAction)}
        onOpenChange={(open) => !open && setEditAction(null)}
      >
        <DialogContent>
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>
                {editAction?.mode === "rename"
                  ? `Rename ${editAction.kind}`
                  : editAction?.kind === "note" &&
                      editAction.noteKind === "visualize"
                    ? "New visualize note"
                    : `New ${editAction?.kind ?? "item"}`}
              </DialogTitle>
              <DialogDescription>
                {editAction?.kind === "note"
                  ? editAction.noteKind === "visualize"
                    ? "Opens a diagram prompt for software, architecture, and algorithms."
                    : "Notes open immediately after they are created."
                  : "Directories can contain notes and other directories."}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3">
              <Input
                autoFocus
                value={editAction?.value ?? ""}
                onChange={(event) =>
                  setEditAction((current) =>
                    current
                      ? { ...current, value: event.target.value }
                      : current,
                  )
                }
                placeholder={
                  editAction?.kind === "note" ? "Note title" : "Directory name"
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditAction(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteAction)}
        onOpenChange={(open) => !open && closeDelete()}
      >
        <DialogContent>
          <form onSubmit={confirmDelete} noValidate>
            <DialogHeader>
              <DialogTitle>Move to Trash?</DialogTitle>
              <DialogDescription>
                {deleteAction?.kind === "directory"
                  ? `“${deleteAction.name}” and everything inside it will move to Trash.`
                  : `“${deleteAction?.name}” will move to Trash.`}
              </DialogDescription>
            </DialogHeader>
            {deleteAction?.kind === "directory" ? (
              <div className="mt-3 flex flex-col gap-2">
                <label
                  htmlFor="delete-confirmation"
                  className="block text-xs leading-5 text-muted-foreground"
                >
                  Type{" "}
                  <span className="font-mono text-foreground">
                    {deleteAction.name}
                  </span>{" "}
                  to confirm
                </label>
                <Input
                  id="delete-confirmation"
                  autoFocus
                  value={deleteConfirmation}
                  onChange={(event) => {
                    setDeleteConfirmation(event.target.value);
                    setDeleteError("");
                  }}
                  placeholder={deleteAction.name}
                  autoComplete="off"
                  spellCheck={false}
                />
                {deleteError ? (
                  <p className="font-mono text-xs leading-5 text-destructive">
                    {deleteError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={closeDelete}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={
                  submitting ||
                  (deleteAction?.kind === "directory" &&
                    !directoryDeleteMatchSchema(deleteAction.name).safeParse({
                      confirmation: deleteConfirmation,
                    }).success)
                }
              >
                {submitting ? "Moving…" : "Move to Trash"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

type DirectoryNodeProps = {
  directory: DirectoryItem;
  directories: DirectoryItem[];
  notes: NoteSummary[];
  expanded: Set<string>;
  selectedDirectoryId: string | null;
  selectedNoteId: string | null;
  dropTargetId: string | null;
  getDraggingItem: () => TreeDragPayload | null;
  onToggle: (id: string) => void;
  onEnsureExpanded: (id: string) => void;
  onSelectDirectory: (id: string) => void;
  onCreateDirectory: (parentId: string) => void;
  onCreateNote: (directoryId: string) => void;
  onCreateVisualizeNote: (directoryId: string) => void;
  onRenameDirectory: (directory: DirectoryItem) => void;
  onRenameNote: (note: NoteSummary) => void;
  onDeleteDirectory: (directory: DirectoryItem) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onOpenNote: (id: string) => void;
  onDragItemStart: (item: TreeDragPayload) => void;
  onDragItemEnd: () => void;
  canDropOnDirectory: (
    drag: TreeDragPayload,
    targetDirectoryId: string,
  ) => boolean;
  onDropTargetChange: (id: string | null) => void;
  onDropOnDirectory: (
    drag: TreeDragPayload,
    targetDirectoryId: string,
  ) => void | Promise<void>;
};

function startTreeDragEvent(
  event: React.DragEvent,
  item: TreeDragPayload,
  onStart: (item: TreeDragPayload) => void,
) {
  onStart(item);
  const payload = JSON.stringify(item);
  event.dataTransfer.setData(TREE_DRAG_MIME, payload);
  event.dataTransfer.setData("text/plain", payload);
  event.dataTransfer.effectAllowed = "move";
}

function TreeNoteRow({
  note,
  selected,
  onOpen,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  note: NoteSummary;
  selected: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDragStart: (item: TreeDragPayload) => void;
  onDragEnd: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          draggable
          onDragStart={(event) =>
            startTreeDragEvent(event, { kind: "note", id: note.id }, onDragStart)
          }
          onDragEnd={onDragEnd}
          onClick={onOpen}
          className={`sidebar-row w-full truncate ${
            selected
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
          }`}
        >
          {note.kind === "visualize" ? (
            <DiagramFlowHorizontal size={13} className="shrink-0 opacity-60" />
          ) : (
            <FileText size={13} className="shrink-0 opacity-60" />
          )}
          <span className="truncate">{note.title}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <Pencil size={14} />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          className="text-red-600 data-[highlighted]:text-red-700 dark:text-red-400 dark:data-[highlighted]:text-red-300"
          onSelect={onDelete}
        >
          <Trash2 size={14} />
          Move to Trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DirectoryNode(props: DirectoryNodeProps) {
  const open = props.expanded.has(props.directory.id);
  const selected = props.selectedDirectoryId === props.directory.id;
  const isDropTarget = props.dropTargetId === props.directory.id;
  const children = props.directories
    .filter((item) => item.parentId === props.directory.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const notes = props.notes
    .filter((note) => note.directoryId === props.directory.id)
    .sort((a, b) => a.title.localeCompare(b.title));

  function handleDirectoryDragOver(event: React.DragEvent) {
    const drag = props.getDraggingItem();
    if (!drag) return;
    if (!props.canDropOnDirectory(drag, props.directory.id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (props.dropTargetId !== props.directory.id) {
      props.onDropTargetChange(props.directory.id);
    }
    props.onEnsureExpanded(props.directory.id);
  }

  function handleDirectoryDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const drag = readTreeDrag(event) ?? props.getDraggingItem();
    props.onDropTargetChange(null);
    if (!drag) return;
    void props.onDropOnDirectory(drag, props.directory.id);
  }

  return (
    <div data-tree-branch>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            draggable
            onDragStart={(event) =>
              startTreeDragEvent(
                event,
                { kind: "directory", id: props.directory.id },
                props.onDragItemStart,
              )
            }
            onDragEnd={props.onDragItemEnd}
            onDragOver={handleDirectoryDragOver}
            onDragLeave={(event) => {
              if (
                event.currentTarget.contains(event.relatedTarget as Node | null)
              ) {
                return;
              }
              if (props.dropTargetId === props.directory.id) {
                props.onDropTargetChange(null);
              }
            }}
            onDrop={handleDirectoryDrop}
            className={`group flex h-8 items-center gap-1 rounded-sm px-1 text-xs hover:bg-sidebar-accent/70 ${
              isDropTarget
                ? "bg-theme-accent-soft text-foreground ring-1 ring-theme-accent/50"
                : selected
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            <button
              onClick={() => props.onToggle(props.directory.id)}
              className="icon-button h-6 w-6 shrink-0"
              aria-label={open ? "Collapse directory" : "Expand directory"}
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <button
              onClick={() => {
                props.onSelectDirectory(props.directory.id);
                props.onToggle(props.directory.id);
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <Folder size={14} className="shrink-0" />
              <span className="truncate">{props.directory.name}</span>
            </button>
            <div className="hidden shrink-0 items-center group-hover:flex">
              <button
                className="icon-button h-6 w-6"
                onClick={() => props.onCreateNote(props.directory.id)}
                aria-label="New note"
              >
                <FilePlus2 size={13} />
              </button>
              <button
                className="icon-button h-6 w-6"
                onClick={() => props.onCreateDirectory(props.directory.id)}
                aria-label="New sub-directory"
              >
                <FolderPlus size={13} />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => props.onCreateNote(props.directory.id)}
          >
            <FilePlus2 size={14} />
            New note
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => props.onCreateVisualizeNote(props.directory.id)}
          >
            <DiagramFlowHorizontal size={14} />
            New visualize note
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => props.onCreateDirectory(props.directory.id)}
          >
            <FolderPlus size={14} />
            New directory
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => props.onRenameDirectory(props.directory)}
          >
            <Pencil size={14} />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="text-red-600 data-[highlighted]:text-red-700 dark:text-red-400 dark:data-[highlighted]:text-red-300"
            onSelect={() => props.onDeleteDirectory(props.directory)}
          >
            <Trash2 size={14} />
            Move to Trash
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {open ? (
        <div className="ml-3 border-l border-sidebar-border pl-2">
          {children.map((directory) => (
            <DirectoryNode
              {...props}
              key={directory.id}
              directory={directory}
            />
          ))}
          {notes.map((note) => (
            <TreeNoteRow
              key={note.id}
              note={note}
              selected={props.selectedNoteId === note.id}
              onOpen={() => props.onOpenNote(note.id)}
              onRename={() => props.onRenameNote(note)}
              onDelete={() => props.onDeleteNote(note)}
              onDragStart={props.onDragItemStart}
              onDragEnd={props.onDragItemEnd}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
