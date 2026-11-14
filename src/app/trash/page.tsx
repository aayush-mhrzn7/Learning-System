"use client";

import { ChevronLeft, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trashToasts } from "@/lib/toast-messages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type TrashBatch = {
  batchId: string;
  name: string;
  kind: "directory" | "note";
  noteCount: number;
  directoryCount: number;
  deletedAt: string;
};

type ConfirmAction =
  | { kind: "empty" }
  | { kind: "restore-all" }
  | { kind: "delete"; batch: TrashBatch };

export default function TrashPage() {
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [restoringAll, setRestoringAll] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );

  async function load() {
    setLoadError(false);
    try {
      const response = await fetch("/api/trash");
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      const data = (await response.json()) as { batches: TrashBatch[] };
      setBatches(data.batches);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(batchId: string) {
    if (pendingId || emptying || restoringAll) return;
    const previous = batches;
    setPendingId(batchId);
    const toastId = toast.loading(trashToasts.restoring);
    setBatches((current) =>
      current.filter((batch) => batch.batchId !== batchId),
    );
    try {
      const response = await fetch(`/api/trash/${batchId}`, { method: "POST" });
      if (!response.ok) {
        setBatches(previous);
        toast.error(trashToasts.restoreFailed, { id: toastId });
        return;
      }
      toast.success(trashToasts.restored, { id: toastId });
    } finally {
      setPendingId(null);
    }
  }

  async function restoreAll() {
    if (pendingId || emptying || restoringAll || batches.length === 0) return;
    const previous = batches;
    setRestoringAll(true);
    setConfirmAction(null);
    const toastId = toast.loading(trashToasts.restoringAll);
    setBatches([]);
    try {
      const response = await fetch("/api/trash", { method: "POST" });
      if (!response.ok) {
        setBatches(previous);
        toast.error(trashToasts.restoreAllFailed, { id: toastId });
        return;
      }
      toast.success(trashToasts.restoredAll, { id: toastId });
    } finally {
      setRestoringAll(false);
    }
  }

  async function remove(batch: TrashBatch) {
    if (pendingId || emptying || restoringAll) return;
    const previous = batches;
    setPendingId(batch.batchId);
    setConfirmAction(null);
    const toastId = toast.loading(trashToasts.deleting);
    setBatches((current) =>
      current.filter((item) => item.batchId !== batch.batchId),
    );
    try {
      const response = await fetch(`/api/trash/${batch.batchId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setBatches(previous);
        toast.error(trashToasts.deleteFailed, { id: toastId });
        return;
      }
      toast.success(trashToasts.deleted, { id: toastId });
    } finally {
      setPendingId(null);
    }
  }

  async function removeAll() {
    if (pendingId || emptying || restoringAll || batches.length === 0) return;
    const previous = batches;
    setEmptying(true);
    setConfirmAction(null);
    const toastId = toast.loading(trashToasts.emptying);
    setBatches([]);
    try {
      const response = await fetch("/api/trash", { method: "DELETE" });
      if (!response.ok) {
        setBatches(previous);
        toast.error(trashToasts.emptyFailed, { id: toastId });
        return;
      }
      toast.success(trashToasts.emptied, { id: toastId });
    } finally {
      setEmptying(false);
    }
  }

  const busy = emptying || restoringAll || Boolean(pendingId);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-10 sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:mb-8"
            >
              <ChevronLeft size={14} />
              back
            </Link>
            <h1 className="text-[28px] font-medium leading-tight tracking-[-0.035em]">
              Trash
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
              Restore soft-deleted notes and directories, or remove them for
              good.
            </p>
          </div>
          {!loading && batches.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmAction({ kind: "restore-all" })}
              >
                {restoringAll ? "Restoring…" : "Restore all"}
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => setConfirmAction({ kind: "empty" })}
              >
                {emptying ? "Emptying…" : "Delete all"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[#262626] bg-[#111]">
          {loading ? (
            <div
              className="flex flex-col"
              aria-busy="true"
              aria-label="Loading trash"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`trash-skel-${i}`}
                  className="flex items-center gap-3 border-b border-[#1c1c1c] px-5 py-4 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-40 max-w-[70%]" />
                    <Skeleton className="mt-2 h-3.5 w-28" />
                  </div>
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
              ))}
            </div>
          ) : null}
          {!loading && loadError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[15px] text-muted-foreground">
                Could not load Trash
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {!loading && !loadError && batches.length === 0 ? (
            <p className="px-5 py-12 text-center text-[15px] text-muted-foreground">
              Trash is empty
            </p>
          ) : null}
          {batches.map((batch) => (
            <div
              key={batch.batchId}
              className="flex items-center gap-3 border-b border-[#1c1c1c] px-5 py-4 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] tracking-[-0.015em]">
                  {batch.name}
                </p>
                <p className="mt-1 text-[14px] text-muted-foreground">
                  {batch.directoryCount > 0
                    ? `${batch.directoryCount} ${
                        batch.directoryCount === 1
                          ? "directory"
                          : "directories"
                      }, `
                    : ""}
                  {batch.noteCount} {batch.noteCount === 1 ? "note" : "notes"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => void restore(batch.batchId)}
                aria-label={
                  pendingId === batch.batchId
                    ? `Restoring ${batch.name}`
                    : `Restore ${batch.name}`
                }
              >
                <RotateCcw
                  className={
                    pendingId === batch.batchId ? "animate-spin" : undefined
                  }
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hover:text-[#f87171]"
                disabled={busy}
                onClick={() => setConfirmAction({ kind: "delete", batch })}
                aria-label={`Permanently delete ${batch.name}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === "empty"
                ? "Empty Trash?"
                : confirmAction?.kind === "restore-all"
                  ? "Restore all?"
                  : "Permanently delete?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === "empty"
                ? "Every item in Trash will be permanently deleted."
                : confirmAction?.kind === "restore-all"
                  ? "Every item in Trash will be restored to your workspace."
                  : `“${confirmAction?.batch.name}” and its contents cannot be recovered.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={
                confirmAction?.kind === "restore-all"
                  ? "default"
                  : "destructive"
              }
              size="sm"
              disabled={busy}
              onClick={() => {
                if (confirmAction?.kind === "empty") void removeAll();
                else if (confirmAction?.kind === "restore-all") {
                  void restoreAll();
                } else if (confirmAction?.kind === "delete") {
                  void remove(confirmAction.batch);
                }
              }}
            >
              {confirmAction?.kind === "empty"
                ? emptying
                  ? "Emptying…"
                  : "Delete all permanently"
                : confirmAction?.kind === "restore-all"
                  ? restoringAll
                    ? "Restoring…"
                    : "Restore all"
                  : pendingId
                    ? "Deleting…"
                    : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
