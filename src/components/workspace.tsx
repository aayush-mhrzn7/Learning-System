"use client";

import { FolderPlus, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NoteEditor } from "@/components/note-editor";
import { SearchDialog } from "@/components/search-dialog";
import { Sidebar } from "@/components/sidebar";
import { TrashDialog } from "@/components/trash-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TreePayload } from "@/lib/types";

const emptyTree: TreePayload = { directories: [], notes: [] };

export function Workspace() {
  const [tree, setTree] = useState<TreePayload>(emptyTree);
  const treeRef = useRef<TreePayload>(emptyTree);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window === "undefined"
      ? false
      : localStorage.getItem("learning-sidebar-collapsed") === "true",
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [firstDirectoryOpen, setFirstDirectoryOpen] = useState(false);
  const [firstDirectoryName, setFirstDirectoryName] = useState("");
  const [loaded, setLoaded] = useState(false);

  const openNote = useCallback((id: string) => {
    setSelectedNoteId(id);
    localStorage.setItem("learning-last-note", id);
  }, []);

  const loadTree = useCallback(
    async (preferredNoteId?: string) => {
      const response = await fetch("/api/tree");
      if (!response.ok) return;
      const data = (await response.json()) as TreePayload;
      treeRef.current = data;
      setTree(data);
      setSelectedNoteId((current) => {
        const preferred =
          preferredNoteId ||
          current ||
          localStorage.getItem("learning-last-note");
        const next = data.notes.some((note) => note.id === preferred)
          ? preferred!
          : (data.notes[0]?.id ?? null);
        if (next) localStorage.setItem("learning-last-note", next);
        else localStorage.removeItem("learning-last-note");
        return next;
      });
      setLoaded(true);
    },
    [],
  );

  const applyOptimisticTree = useCallback(
    (updater: (tree: TreePayload) => TreePayload) => {
      const next = updater(treeRef.current);
      treeRef.current = next;
      setTree(next);
      setSelectedNoteId((current) => {
        if (!current) return null;
        if (next.notes.some((note) => note.id === current)) {
          return current;
        }
        const fallback = next.notes[0]?.id ?? null;
        if (fallback) localStorage.setItem("learning-last-note", fallback);
        else localStorage.removeItem("learning-last-note");
        return fallback;
      });
    },
    [],
  );

  useEffect(() => {
    const task = window.setTimeout(() => void loadTree(), 0);
    return () => window.clearTimeout(task);
  }, [loadTree]);

  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarCollapsed((current) => {
          localStorage.setItem(
            "learning-sidebar-collapsed",
            String(!current),
          );
          return !current;
        });
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setTrashOpen(false);
      }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);

  function collapseSidebar() {
    setSidebarCollapsed(true);
    localStorage.setItem("learning-sidebar-collapsed", "true");
  }

  function openSidebar() {
    setSidebarCollapsed(false);
    localStorage.setItem("learning-sidebar-collapsed", "false");
  }

  async function createFirstDirectory() {
    if (!firstDirectoryName.trim()) return;
    const tempId = crypto.randomUUID();
    const previous = treeRef.current;
    applyOptimisticTree((current) => ({
      ...current,
      directories: [
        ...current.directories,
        { id: tempId, name: firstDirectoryName.trim(), parentId: null },
      ],
    }));
    setFirstDirectoryOpen(false);
    const response = await fetch("/api/directories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: firstDirectoryName, parentId: null }),
    });
    if (!response.ok) {
      applyOptimisticTree(() => previous);
      return;
    }
    await loadTree();
    setFirstDirectoryName("");
  }

  if (!loaded) {
    return (
      <main className="grid min-h-screen place-items-center text-xs text-muted">
        Loading…
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {!sidebarCollapsed ? (
        <Sidebar
          tree={tree}
          selectedNoteId={selectedNoteId}
          onOpenNote={openNote}
          onChanged={loadTree}
          onOptimisticTree={applyOptimisticTree}
          onCollapse={collapseSidebar}
          onSearch={() => setSearchOpen(true)}
          onTrash={() => setTrashOpen(true)}
        />
      ) : null}

      {selectedNoteId ? (
        <NoteEditor
          key={selectedNoteId}
          noteId={selectedNoteId}
          sidebarCollapsed={sidebarCollapsed}
          onOpenSidebar={openSidebar}
          onTreeChanged={loadTree}
        />
      ) : (
        <main className="relative grid flex-1 place-items-center">
          {sidebarCollapsed ? (
            <button
              onClick={openSidebar}
              className="icon-button absolute left-4 top-4"
              aria-label="Open sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          ) : null}
          <div className="text-center">
            <p className="mb-6 text-sm text-muted">
              Create a directory to begin.
            </p>
            <button
              onClick={() => setFirstDirectoryOpen(true)}
              className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-xs font-medium text-background"
            >
              <FolderPlus size={14} />
              New directory
            </button>
          </div>
        </main>
      )}

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenNote={openNote}
      />
      <TrashDialog
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onChanged={loadTree}
      />
      <Dialog
        open={firstDirectoryOpen}
        onOpenChange={setFirstDirectoryOpen}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createFirstDirectory();
            }}
          >
            <DialogHeader>
              <DialogTitle>New directory</DialogTitle>
              <DialogDescription>
                Create your first directory, then right-click it to add notes
                or nested directories.
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 py-5">
              <Input
                autoFocus
                value={firstDirectoryName}
                onChange={(event) => setFirstDirectoryName(event.target.value)}
                placeholder="Directory name"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFirstDirectoryOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
