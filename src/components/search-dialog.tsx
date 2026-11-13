"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type SearchResult = {
  id: string;
  title: string;
  path: string;
  snippet: string;
};

export function SearchDialog({
  open,
  onClose,
  onOpenNote,
}: {
  open: boolean;
  onClose: () => void;
  onOpenNote: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
        );
        if (cancelled) return;
        if (response.ok) {
          const data = (await response.json()) as { results: SearchResult[] };
          setResults(data.results);
        } else {
          setResults([]);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="top-[18vh] max-w-xl translate-y-0 overflow-hidden p-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <div className="flex h-12 items-center gap-3 border-b border-border px-4">
          <Search size={16} className="text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder="Search your notes"
            className="h-full flex-1 bg-transparent text-[15px] leading-[1.2] tracking-[-0.01em] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="font-mono text-[12px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {searching ? (
            <div
              className="flex flex-col gap-1 p-1"
              aria-busy="true"
              aria-label="Searching"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`search-skel-${i}`} className="rounded-[6px] px-3 py-2.5">
                  <Skeleton className="h-4 w-44 max-w-[70%]" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                  <Skeleton className="mt-2 h-3.5 w-full" />
                </div>
              ))}
            </div>
          ) : null}
          {!searching && query && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[15px] text-muted-foreground">
              No matching notes
            </p>
          ) : null}
          {!searching
            ? results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => {
                    onOpenNote(result.id);
                    onClose();
                  }}
                  className="block w-full rounded-[6px] px-3 py-2.5 text-left hover:bg-muted"
                >
                  <span className="block text-[15px] leading-5 tracking-[-0.01em]">
                    {result.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-4 text-muted-foreground">
                    {result.path}
                  </span>
                  {result.snippet ? (
                    <span className="mt-1.5 block truncate text-[14px] leading-4 text-muted-foreground">
                      {result.snippet.replaceAll(/<\/?mark>/g, "")}
                    </span>
                  ) : null}
                </button>
              ))
            : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
