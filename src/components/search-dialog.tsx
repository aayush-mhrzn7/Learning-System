"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="top-[18vh] max-w-xl translate-y-0 overflow-hidden p-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <div className="flex h-12 items-center gap-3 border-b border-[#1c1c1c] px-4">
          <Search size={16} className="text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder="Search your notes"
            className="h-full flex-1 bg-transparent text-[13px] leading-[1.2] tracking-[-0.01em] outline-none placeholder:text-[#555]"
          />
          <kbd className="font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {query && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              No matching notes
            </p>
          ) : null}
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                onOpenNote(result.id);
                onClose();
              }}
              className="block w-full rounded-[6px] px-3 py-2.5 text-left hover:bg-[#1a1a1a]"
            >
              <span className="block text-[13px] leading-5 tracking-[-0.01em]">
                {result.title}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                {result.path}
              </span>
              {result.snippet ? (
                <span className="mt-1.5 block truncate text-[12px] leading-4 text-[#777]">
                  {result.snippet.replaceAll(/<\/?mark>/g, "")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
