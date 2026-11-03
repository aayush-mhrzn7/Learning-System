"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TrashBatch = {
  batchId: string;
  name: string;
  kind: "directory" | "note";
  noteCount: number;
  directoryCount: number;
  deletedAt: string;
};

export default function TrashPage() {
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [pendingDelete, setPendingDelete] = useState<TrashBatch | null>(null);
  const [loading, setLoading] = useState(true);

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
  }

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground sm:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-8 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
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
          <Button asChild variant="outline">
            <Link href="/">Back</Link>
          </Button>
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
                onClick={() => void restore(batch.batchId)}
                aria-label={`Restore ${batch.name}`}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hover:text-[#f87171]"
                onClick={() => setPendingDelete(batch)}
                aria-label={`Permanently delete ${batch.name}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>

        {pendingDelete ? (
          <div className="mt-4 rounded-[10px] border border-[#262626] bg-[#111] p-5">
            <h2 className="text-[15px] font-medium tracking-[-0.02em]">
              Permanently delete?
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
              “{pendingDelete.name}” and its contents cannot be recovered.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void remove()}
              >
                Delete permanently
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
