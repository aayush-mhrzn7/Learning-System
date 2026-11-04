"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type ConfirmAction =
  | { kind: "empty" }
  | { kind: "delete"; batch: TrashBatch };

export default function TrashPage() {
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );

  async function load() {
    const response = await fetch("/api/trash");
    if (response.ok) {
      const data = (await response.json()) as { batches: TrashBatch[] };
      setBatches(data.batches);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(batchId: string) {
    if (pendingId || emptying) return;
    const previous = batches;
    setPendingId(batchId);
    const toastId = toast.loading("Restoring…");
    setBatches((current) =>
      current.filter((batch) => batch.batchId !== batchId),
    );
    try {
      const response = await fetch(`/api/trash/${batchId}`, { method: "POST" });
      if (!response.ok) {
        setBatches(previous);
        toast.error("Could not restore item", { id: toastId });
        return;
      }
      toast.success("Restored", { id: toastId });
    } finally {
      setPendingId(null);
    }
  }

  async function remove(batch: TrashBatch) {
    if (pendingId || emptying) return;
    const previous = batches;
    setPendingId(batch.batchId);
    setConfirmAction(null);
    const toastId = toast.loading("Deleting…");
    setBatches((current) =>
      current.filter((item) => item.batchId !== batch.batchId),
    );
    try {
      const response = await fetch(`/api/trash/${batch.batchId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setBatches(previous);
        toast.error("Could not permanently delete item", { id: toastId });
        return;
      }
      toast.success("Permanently deleted", { id: toastId });
    } finally {
      setPendingId(null);
    }
  }

  async function removeAll() {
    if (pendingId || emptying || batches.length === 0) return;
    const previous = batches;
    setEmptying(true);
    setConfirmAction(null);
    const toastId = toast.loading("Emptying…");
    setBatches([]);
    try {
      const response = await fetch("/api/trash", { method: "DELETE" });
      if (!response.ok) {
        setBatches(previous);
        toast.error("Could not empty Trash", { id: toastId });
        return;
      }
      toast.success("Trash emptied", { id: toastId });
    } finally {
      setEmptying(false);
    }
  }

  const busy = emptying || Boolean(pendingId);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-10 sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <p className="mb-6 text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:mb-8">
              Learning System
            </p>
            <h1 className="text-[28px] font-medium leading-tight tracking-[-0.035em]">
              Trash
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
              Restore soft-deleted notes and directories, or remove them for
              good.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!loading && batches.length > 0 ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => setConfirmAction({ kind: "empty" })}
              >
                {emptying ? "Emptying…" : "Delete all"}
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/">Back</Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-[#262626] bg-[#111]">
          {loading ? (
            <p className="px-5 py-12 text-center text-[13px] text-muted-foreground">
              Loading…
            </p>
          ) : null}
          {!loading && batches.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-muted-foreground">
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
                <p className="mt-1 text-[12px] text-muted-foreground">
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
                : "Permanently delete?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === "empty"
                ? "Every item in Trash will be permanently deleted."
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
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (confirmAction?.kind === "empty") void removeAll();
                else if (confirmAction?.kind === "delete") {
                  void remove(confirmAction.batch);
                }
              }}
            >
              {confirmAction?.kind === "empty"
                ? emptying
                  ? "Emptying…"
                  : "Delete all permanently"
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
