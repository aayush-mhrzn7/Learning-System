"use client";

import {
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus2,
  Folder,
  FolderPlus,
  LogOut,
  Pencil,
  PanelLeftClose,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type {
  DirectoryItem,
  NoteSummary,
  TreePayload,
} from "@/lib/types";

type SidebarProps = {
  tree: TreePayload;
  selectedNoteId: string | null;
  onOpenNote: (id: string) => void;
  onChanged: (preferredNoteId?: string) => Promise<void>;
  onOptimisticTree: (updater: (tree: TreePayload) => TreePayload) => void;
  onCollapse: () => void;
  onSearch: () => void;
  onTrash: () => void;
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
      directoryId: string;
      id?: string;
      value: string;
    };

type DeleteAction =
  | { kind: "directory"; id: string; name: string }
  | { kind: "note"; id: string; name: string };

export function Sidebar(props: SidebarProps) {
  const router = useRouter();
  const [editAction, setEditAction] = useState<EditAction | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = localStorage.getItem("learning-expanded-directories");
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  });

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
        const tempId = crypto.randomUUID();
        const optimistic: NoteSummary = {
          id: tempId,
          directoryId: editAction.directoryId,
          title: editAction.value.trim(),
          status: "draft",
          updatedAt: new Date().toISOString(),
        };
        props.onOptimisticTree((tree) => ({
          ...tree,
          notes: [...tree.notes, optimistic],
        }));
        toggleOpen(editAction.directoryId);

        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directoryId: editAction.directoryId,
            title: editAction.value,
          }),
        });
        if (!response.ok) throw new Error();
        const { note } = (await response.json()) as { note: NoteSummary };
        props.onOptimisticTree((tree) => ({
          ...tree,
          notes: tree.notes.map((item) =>
            item.id === tempId ? note : item,
          ),
        }));
        props.onOpenNote(note.id);
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
      rollback(previous, "Could not save that change");
    } finally {
      setSubmitting(false);
    }
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

  async function confirmDelete() {
    if (!deleteAction) return;
    const previous = props.tree;
    setDeleteAction(null);

    if (deleteAction.kind === "note") {
      props.onOptimisticTree((tree) => ({
        ...tree,
        notes: tree.notes.filter((note) => note.id !== deleteAction.id),
      }));
    } else {
      const removed = descendantDirectoryIds(deleteAction.id);
      props.onOptimisticTree((tree) => ({
        directories: tree.directories.filter(
          (directory) => !removed.has(directory.id),
        ),
        notes: tree.notes.filter(
          (note) => !removed.has(note.directoryId),
        ),
      }));
    }

    const endpoint =
      deleteAction.kind === "note"
        ? `/api/notes/${deleteAction.id}`
        : `/api/directories/${deleteAction.id}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    if (!response.ok) {
      rollback(previous, "Could not move item to Trash");
      return;
    }
    toast.success("Moved to Trash");
  }

  const roots = useMemo(
    () =>
      props.tree.directories
        .filter((directory) => !directory.parentId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [props.tree.directories],
  );

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-border bg-[#080808]">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="text-xs font-medium uppercase tracking-[0.2em]">
          Learning
        </span>
        <button
          onClick={props.onCollapse}
          className="icon-button"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button
        onClick={props.onSearch}
        className="mx-3 mt-3 flex h-9 items-center gap-2 border border-border px-3 text-left text-xs text-muted transition-colors hover:border-[#444] hover:text-foreground"
      >
        <Search size={14} />
        Search
        <kbd className="ml-auto font-mono text-[10px]">⌘K</kbd>
      </button>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        {roots.length ? (
          roots.map((directory) => (
            <DirectoryNode
              key={directory.id}
              directory={directory}
              directories={props.tree.directories}
              notes={props.tree.notes}
              expanded={expanded}
              selectedNoteId={props.selectedNoteId}
              onToggle={toggle}
              onCreateDirectory={(parentId) =>
                setEditAction({
                  kind: "directory",
                  mode: "create",
                  parentId,
                  value: "",
                })
              }
              onCreateNote={(directoryId) =>
                setEditAction({
                  kind: "note",
                  mode: "create",
                  directoryId,
                  value: "Untitled",
                })
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
                setDeleteAction({
                  kind: "directory",
                  id: directory.id,
                  name: directory.name,
                })
              }
              onDeleteNote={(note) =>
                setDeleteAction({
                  kind: "note",
                  id: note.id,
                  name: note.title,
                })
              }
              onOpenNote={props.onOpenNote}
            />
          ))
        ) : (
          <button
            onClick={() =>
              setEditAction({
                kind: "directory",
                mode: "create",
                parentId: null,
                value: "",
              })
            }
            className="flex w-full items-center gap-2 px-2 py-2 text-xs text-muted hover:text-foreground"
          >
            <FolderPlus size={14} />
            New directory
          </button>
        )}
      </div>

      <div className="border-t border-border p-2">
        <button
          onClick={() =>
            setEditAction({
              kind: "directory",
              mode: "create",
              parentId: null,
              value: "",
            })
          }
          className="sidebar-row w-full text-muted hover:text-foreground"
        >
          <FolderPlus size={14} />
          New directory
        </button>
        <button
          onClick={props.onTrash}
          className="sidebar-row w-full text-muted hover:text-foreground"
        >
          <Trash2 size={14} />
          Trash
        </button>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.replace("/login");
            router.refresh();
          }}
          className="sidebar-row w-full text-muted hover:text-foreground"
        >
          <LogOut size={14} />
          Lock
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
                  : `New ${editAction?.kind ?? "item"}`}
              </DialogTitle>
              <DialogDescription>
                {editAction?.kind === "note"
                  ? "Notes open immediately after they are created."
                  : "Directories can contain notes and other directories."}
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 py-5">
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
                variant="ghost"
                onClick={() => setEditAction(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteAction)}
        onOpenChange={(open) => !open && setDeleteAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAction?.kind === "directory"
                ? `“${deleteAction.name}” and everything inside it will move to Trash.`
                : `“${deleteAction?.name}” will move to Trash.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

type DirectoryNodeProps = {
  directory: DirectoryItem;
  directories: DirectoryItem[];
  notes: NoteSummary[];
  expanded: Set<string>;
  selectedNoteId: string | null;
  onToggle: (id: string) => void;
  onCreateDirectory: (parentId: string) => void;
  onCreateNote: (directoryId: string) => void;
  onRenameDirectory: (directory: DirectoryItem) => void;
  onRenameNote: (note: NoteSummary) => void;
  onDeleteDirectory: (directory: DirectoryItem) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onOpenNote: (id: string) => void;
};

function DirectoryNode(props: DirectoryNodeProps) {
  const open = props.expanded.has(props.directory.id);
  const children = props.directories
    .filter((item) => item.parentId === props.directory.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const notes = props.notes
    .filter((note) => note.directoryId === props.directory.id)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="group flex h-8 items-center gap-1 rounded-sm px-1 text-xs text-[#c4c4c4] hover:bg-[#121212]">
            <button
              onClick={() => props.onToggle(props.directory.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Folder size={14} />
              <span className="truncate">{props.directory.name}</span>
            </button>
            <div className="hidden items-center group-hover:flex">
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
            onSelect={() => props.onCreateDirectory(props.directory.id)}
          >
            <FolderPlus size={14} />
            New sub-directory
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => props.onRenameDirectory(props.directory)}
          >
            <Pencil size={14} />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="text-red-400 data-[highlighted]:text-red-300"
            onSelect={() => props.onDeleteDirectory(props.directory)}
          >
            <Trash2 size={14} />
            Move to Trash
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {open ? (
        <div className="ml-3 border-l border-[#202020] pl-2">
          {children.map((directory) => (
            <DirectoryNode
              {...props}
              key={directory.id}
              directory={directory}
            />
          ))}
          {notes.map((note) => (
            <ContextMenu key={note.id}>
              <ContextMenuTrigger asChild>
                <button
                  onClick={() => props.onOpenNote(note.id)}
                  className={`sidebar-row w-full truncate ${
                    props.selectedNoteId === note.id
                      ? "bg-[#171717] text-foreground"
                      : "text-muted hover:bg-[#111] hover:text-foreground"
                  }`}
                >
                  <FileText size={13} className="shrink-0 opacity-60" />
                  <span className="truncate">{note.title}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => props.onRenameNote(note)}>
                  <Pencil size={14} />
                  Rename
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-red-400 data-[highlighted]:text-red-300"
                  onSelect={() => props.onDeleteNote(note)}
                >
                  <Trash2 size={14} />
                  Move to Trash
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      ) : null}
    </div>
  );
}
