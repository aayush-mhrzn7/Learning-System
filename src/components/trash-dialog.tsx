"use client";

import { RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TrashBatch = {
  batchId: string;
  name: string;
  kind: "directory" | "note";
  noteCount: number;
  directoryCount: number;
  deletedAt: string;
};

export function TrashDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [pendingDelete, setPendingDelete] = useState<TrashBatch | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/trash")
      .then((response) => response.json())
      .then((data: { batches: TrashBatch[] }) => {
        if (!cancelled) setBatches(data.batches);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function restore(batchId: string) {
    const previous = batches;
    setBatches((current) =>
      current.filter((batch) => batch.batchId !== batchId),
    );
    const response = await fetch(`/api/trash/${batchId}`, { method: "POST" });
    if (!response.ok) {
      setBatches(previous);
      toast.error("Could not restore item");
      return;
    }
    toast.success("Restored");
    await onChanged();
  }

  async function remove() {
    if (!pendingDelete) return;
    const batch = pendingDelete;
    const previous = batches;
    setPendingDelete(null);
    setBatches((current) =>
      current.filter((item) => item.batchId !== batch.batchId),
    );
    const response = await fetch(`/api/trash/${batch.batchId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setBatches(previous);
      toast.error("Could not permanently delete item");
      return;
    }
    toast.success("Permanently deleted");
    await onChanged();
  }

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-xl" showCloseButton={false}>
        <header className="flex h-14 items-center justify-between border-b border-border px-5">
          <DialogHeader className="p-0">
            <DialogTitle>Trash</DialogTitle>
          </DialogHeader>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
            <span className="sr-only">Close</span>
          </Button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {batches.length === 0 ? (
            <p className="py-14 text-center text-xs text-muted">
              Trash is empty
            </p>
          ) : null}
          {batches.map((batch) => (
            <div
              key={batch.batchId}
              className="flex items-center gap-3 border-b border-[#171717] px-3 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{batch.name}</p>
                <p className="mt-1 text-[11px] text-muted">
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
              <button
                className="icon-button"
                onClick={() => restore(batch.batchId)}
                aria-label={`Restore ${batch.name}`}
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="icon-button hover:text-red-400"
                onClick={() => setPendingDelete(batch)}
                aria-label={`Permanently delete ${batch.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => !next && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” and its contents cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
