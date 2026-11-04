"use client";

import { FolderPlus, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { NoteEditor } from "@/components/note-editor";
import { SearchDialog } from "@/components/search-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { Sidebar } from "@/components/sidebar";
import { VisualizeNote } from "@/components/visualize-note";
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
import { cn } from "@/lib/utils";

const emptyTree: TreePayload = { directories: [], notes: [] };
const MOBILE_MQ = "(max-width: 767px)";

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

export function Workspace() {
  const [tree, setTree] = useState<TreePayload>(emptyTree);
  const treeRef = useRef<TreePayload>(emptyTree);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  // Closed by default (esp. mobile). Desktop preference restored after mount.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [firstDirectoryOpen, setFirstDirectoryOpen] = useState(false);
  const [firstDirectoryName, setFirstDirectoryName] = useState("");
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const openNote = useCallback((id: string) => {
    setGraphOpen(false);
    setSelectedNoteId(id);
    localStorage.setItem("learning-last-note", id);
    if (isMobileViewport()) setSidebarCollapsed(true);
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

  const onNoteTitleChange = useCallback(
    (id: string, title: string) => {
      applyOptimisticTree((current) => ({
        ...current,
        notes: current.notes.map((note) =>
          note.id === id ? { ...note, title } : note,
        ),
      }));
    },
    [applyOptimisticTree],
  );

  useEffect(() => {
    const task = window.setTimeout(() => void loadTree(), 0);
    return () => window.clearTimeout(task);
  }, [loadTree]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    function syncViewport() {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
        return;
      }
      setSidebarCollapsed(
        localStorage.getItem("learning-sidebar-collapsed") === "true",
      );
    }
    syncViewport();
    mq.addEventListener("change", syncViewport);
    return () => mq.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.ctrlKey && !event.metaKey && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarCollapsed((current) => {
          const next = !current;
          if (!isMobileViewport()) {
            localStorage.setItem("learning-sidebar-collapsed", String(next));
          }
          return next;
        });
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSettingsOpen(false);
        if (isMobileViewport()) setSidebarCollapsed(true);
      }
    }
    window.addEventListener("keydown", shortcuts, true);
    return () => window.removeEventListener("keydown", shortcuts, true);
  }, []);

  function collapseSidebar() {
    setSidebarCollapsed(true);
    if (!isMobileViewport()) {
      localStorage.setItem("learning-sidebar-collapsed", "true");
    }
  }

  function openSidebar() {
    setSidebarCollapsed(false);
    if (!isMobileViewport()) {
      localStorage.setItem("learning-sidebar-collapsed", "false");
    }
  }

  async function createFirstDirectory() {
    if (!firstDirectoryName.trim() || creatingDirectory) return;
    setCreatingDirectory(true);
    const tempId = crypto.randomUUID();
    const previous = treeRef.current;
    applyOptimisticTree((current) => ({
      ...current,
      directories: [
        ...current.directories,
        { id: tempId, name: firstDirectoryName.trim(), parentId: null },
      ],
    }));
    try {
      const response = await fetch("/api/directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: firstDirectoryName, parentId: null }),
      });
      if (!response.ok) {
        applyOptimisticTree(() => previous);
        return;
      }
      setFirstDirectoryOpen(false);
      await loadTree();
      setFirstDirectoryName("");
    } finally {
      setCreatingDirectory(false);
    }
  }

  if (!loaded) {
    return (
      <main className="grid min-h-screen place-items-center text-xs text-muted-foreground">
        Loading…
      </main>
    );
  }

  const sidebarOpen = !sidebarCollapsed;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {sidebarOpen && isMobile ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/55"
          aria-label="Close sidebar"
          onClick={collapseSidebar}
        />
      ) : null}

      <div
        className={cn(
          !sidebarOpen && "hidden",
          isMobile &&
            sidebarOpen &&
            "fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,20rem)] shadow-2xl",
        )}
      >
        <Sidebar
          tree={tree}
          selectedNoteId={selectedNoteId}
          onOpenNote={openNote}
          onChanged={loadTree}
          onOptimisticTree={applyOptimisticTree}
          onCollapse={collapseSidebar}
          onSearch={() => {
            if (isMobile) setSidebarCollapsed(true);
            setSearchOpen(true);
          }}
          onKnowledgeGraph={() => {
            if (isMobile) setSidebarCollapsed(true);
            setGraphOpen(true);
          }}
          onSettings={() => {
            if (isMobile) setSidebarCollapsed(true);
            setSettingsOpen(true);
          }}
          mobile={isMobile}
        />
      </div>

      {graphOpen ? (
        <KnowledgeGraph
          sidebarCollapsed={sidebarCollapsed}
          onOpenSidebar={openSidebar}
          onOpenNote={openNote}
        />
      ) : selectedNoteId ? (
        tree.notes.find((note) => note.id === selectedNoteId)?.kind ===
        "visualize" ? (
          <VisualizeNote
            key={selectedNoteId}
            noteId={selectedNoteId}
            sidebarCollapsed={sidebarCollapsed}
            onOpenSidebar={openSidebar}
            onTitleChange={onNoteTitleChange}
          />
        ) : (
          <NoteEditor
            key={selectedNoteId}
            noteId={selectedNoteId}
            sidebarCollapsed={sidebarCollapsed}
            onOpenSidebar={openSidebar}
            onTreeChanged={loadTree}
            onTitleChange={onNoteTitleChange}
          />
        )
      ) : (
        <main className="relative grid min-w-0 flex-1 place-items-center px-6">
          {sidebarCollapsed ? (
            <button
              onClick={openSidebar}
              className="icon-button absolute left-3 top-3 sm:left-4 sm:top-4"
              aria-label="Open sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          ) : null}
          <div className="text-center">
            <p className="mb-6 text-sm text-muted-foreground">
              Create a directory to begin.
            </p>
            <Button onClick={() => setFirstDirectoryOpen(true)}>
              <FolderPlus size={14} />
              New directory
            </Button>
          </div>
        </main>
      )}

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenNote={openNote}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
            <div className="mt-3">
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
                variant="outline"
                size="sm"
                disabled={creatingDirectory}
                onClick={() => setFirstDirectoryOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creatingDirectory}>
                {creatingDirectory ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
