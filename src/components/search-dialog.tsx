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
        className="top-[18vh] max-w-xl translate-y-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Search size={17} className="text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder="Search your notes"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[#666]"
          />
          <kbd className="font-mono text-[10px] text-muted">ESC</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {query && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted">
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
              className="block w-full border-b border-[#161616] px-3 py-3 text-left last:border-0 hover:bg-[#111]"
            >
              <span className="block text-sm">{result.title}</span>
              <span className="mt-1 block text-[11px] text-muted">
                {result.path}
              </span>
              {result.snippet ? (
                <span className="mt-2 block truncate text-xs text-[#777]">
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
