"use client";

import {
  Activity,
  FolderPlus,
  GraphStar,
  LogOut,
  PanelLeftOpen,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { workspaceToasts } from "@/lib/toast-messages";
import { Sidebar } from "@/components/sidebar";
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
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { TreePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const NoteEditor = dynamic(
  () =>
    import("@/components/note-editor").then((mod) => mod.NoteEditor),
  { ssr: false },
);
const KnowledgeGraph = dynamic(
  () =>
    import("@/components/knowledge-graph").then((mod) => mod.KnowledgeGraph),
  { ssr: false },
);
const VisualizeNote = dynamic(
  () =>
    import("@/components/visualize-note").then((mod) => mod.VisualizeNote),
  { ssr: false },
);
const UsagePage = dynamic(
  () => import("@/components/usage-page").then((mod) => mod.UsagePage),
  { ssr: false },
);
const SearchDialog = dynamic(
  () =>
    import("@/components/search-dialog").then((mod) => mod.SearchDialog),
  { ssr: false },
);
const SettingsDialog = dynamic(
  () =>
    import("@/components/settings-dialog").then((mod) => mod.SettingsDialog),
  { ssr: false },
);

const emptyTree: TreePayload = { directories: [], notes: [] };
const MOBILE_MQ = "(max-width: 767px)";

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

export function Workspace() {
  const [tree, setTree] = useState<TreePayload>(emptyTree);
  const treeRef = useRef<TreePayload>(emptyTree);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [firstDirectoryOpen, setFirstDirectoryOpen] = useState(false);
  const [firstDirectoryName, setFirstDirectoryName] = useState("");
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [freshNoteId, setFreshNoteId] = useState<string | null>(null);

  const openNote = useCallback((id: string, options?: { fresh?: boolean }) => {
    setGraphOpen(false);
    setUsageOpen(false);
    setFreshNoteId(options?.fresh ? id : null);
    setSelectedNoteId(id);
    localStorage.setItem("learning-last-note", id);
    if (isMobileViewport()) setSidebarCollapsed(true);
  }, []);

  const loadTree = useCallback(
    async (preferredNoteId?: string) => {
      const response = await apiFetch("/api/tree");
      if (!response.ok) return;
      const data = (await response.json()) as TreePayload;
      treeRef.current = data;
      setTree(data);
      setSelectedNoteId((current) => {
        const preferred =
          preferredNoteId ||
          current ||
          localStorage.getItem("learning-last-note");
        const next =
          preferred && data.notes.some((note) => note.id === preferred)
          ? preferred
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
      const response = await apiFetch("/api/directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: firstDirectoryName, parentId: null }),
      });
      if (!response.ok) {
        applyOptimisticTree(() => previous);
        toast.error(workspaceToasts.createDirectoryFailed);
        return;
      }
      setFirstDirectoryOpen(false);
      await loadTree();
      setFirstDirectoryName("");
    } catch {
      applyOptimisticTree(() => previous);
      toast.error(workspaceToasts.createDirectoryFailed);
    } finally {
      setCreatingDirectory(false);
    }
  }

  if (!loaded) {
    return <WorkspaceSkeleton />;
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
            setUsageOpen(false);
            setGraphOpen(true);
          }}
          onUsage={() => {
            if (isMobile) setSidebarCollapsed(true);
            setGraphOpen(false);
            setUsageOpen(true);
          }}
          onSettings={() => {
            if (isMobile) setSidebarCollapsed(true);
            setSettingsOpen(true);
          }}
          mobile={isMobile}
        />
      </div>

      {usageOpen ? (
        <UsagePage
          sidebarCollapsed={sidebarCollapsed}
          onOpenSidebar={openSidebar}
        />
      ) : graphOpen ? (
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
            fresh={freshNoteId === selectedNoteId}
            initialTitle={
              tree.notes.find((note) => note.id === selectedNoteId)?.title
            }
            sidebarCollapsed={sidebarCollapsed}
            onOpenSidebar={openSidebar}
            onTitleChange={onNoteTitleChange}
          />
        ) : (
          <NoteEditor
            key={selectedNoteId}
            noteId={selectedNoteId}
            fresh={freshNoteId === selectedNoteId}
            initialTitle={
              tree.notes.find((note) => note.id === selectedNoteId)?.title
            }
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

function WorkspaceSkeleton() {
  return (
    <div
      className="flex h-dvh overflow-hidden bg-background text-foreground"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <aside className="hidden h-full w-[340px] shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-border px-3 sm:px-4">
          <span className="text-xs font-medium uppercase tracking-[0.2em]">
            Scholar
          </span>
        </div>

        <div className="mx-3 mt-3 flex h-10 items-center gap-2 border border-border px-3 text-xs text-muted-foreground sm:h-9">
          <Search size={14} />
          Search
          <kbd className="ml-auto hidden font-mono text-[12px] sm:inline">
            ⌘K
          </kbd>
        </div>

        <div className="mx-3 mt-2 flex h-10 items-center gap-2 border border-border px-3 text-xs text-muted-foreground sm:h-9">
          <GraphStar size={14} />
          Knowledge graph
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3 py-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={`tree-${i}`}
              className="h-7"
              style={{
                width: `${48 + ((i * 17) % 40)}%`,
                marginLeft: `${(i % 3) * 12}px`,
              }}
            />
          ))}
        </div>

        <div className="border-t border-border p-2">
          <div className="sidebar-row w-full text-muted-foreground">
            <Activity size={14} />
            Usage
          </div>
          <div className="sidebar-row w-full text-muted-foreground">
            <Settings size={14} />
            Settings
          </div>
          <div className="sidebar-row w-full text-muted-foreground">
            <Trash2 size={14} />
            Trash
          </div>
          <div className="sidebar-row w-full text-muted-foreground">
            <LogOut size={14} />
            Log out
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden px-4 pt-8 sm:px-14 sm:pt-12 lg:px-20">
          <Skeleton className="mb-8 h-10 w-2/3 max-w-lg" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[96%]" />
            <Skeleton className="h-3.5 w-[91%]" />
            <Skeleton className="h-3.5 w-[94%]" />
            <Skeleton className="h-3.5 w-[88%]" />
            <Skeleton className="mt-5 h-3.5 w-[72%]" />
            <Skeleton className="h-3.5 w-[90%]" />
            <Skeleton className="h-3.5 w-[85%]" />
            <Skeleton className="h-3.5 w-[93%]" />
            <Skeleton className="h-3.5 w-[78%]" />
            <Skeleton className="mt-5 h-3.5 w-[65%]" />
            <Skeleton className="h-3.5 w-[87%]" />
            <Skeleton className="h-3.5 w-[81%]" />
            <Skeleton className="h-3.5 w-[58%]" />
          </div>
        </div>
      </main>
    </div>
  );
}
