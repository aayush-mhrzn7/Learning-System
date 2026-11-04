"use client";

import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";

type BlockMark = {
  top: number;
  height: number;
  width: number;
  kind: "heading" | "code" | "text";
};

type ClaimMark = {
  id: string;
  top: number;
  height: number;
};

type Viewport = {
  top: number;
  height: number;
};

/** Height of title + editor body only — ignores article bottom padding. */
function measureWrittenHeight(
  content: HTMLElement,
  scrollTop: number,
): number {
  const contentTop = content.getBoundingClientRect().top;
  let bottom = 0;

  const title = content.querySelector("input");
  if (title) {
    const rect = title.getBoundingClientRect();
    bottom = Math.max(bottom, rect.bottom - contentTop + scrollTop);
  }

  const editor = content.querySelector(".learning-editor");
  if (editor) {
    const children = editor.querySelectorAll(":scope > *");
    if (children.length === 0) {
      const rect = editor.getBoundingClientRect();
      bottom = Math.max(bottom, rect.bottom - contentTop + scrollTop);
    } else {
      children.forEach((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        bottom = Math.max(bottom, rect.bottom - contentTop + scrollTop);
      });
    }
  }

  return Math.max(bottom, 48);
}

export function EditorMinimap({
  scrollRef,
  contentRef,
  revision,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  revision: number;
}) {
  const [blocks, setBlocks] = useState<BlockMark[]>([]);
  const [claims, setClaims] = useState<ClaimMark[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ top: 0, height: 1 });
  const [mapFill, setMapFill] = useState(0.12);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;

    const viewHeight = Math.max(scroll.clientHeight, 1);
    const writtenHeight = measureWrittenHeight(content, scroll.scrollTop);
    setMapFill(Math.min(1, writtenHeight / viewHeight));

    const contentTop = content.getBoundingClientRect().top;
    const nextBlocks: BlockMark[] = [];

    const title = content.querySelector("input");
    if (title && title.value.trim()) {
      const rect = title.getBoundingClientRect();
      nextBlocks.push({
        top: (rect.top - contentTop + scroll.scrollTop) / writtenHeight,
        height: Math.max(rect.height / writtenHeight, 0.02),
        width: Math.min(0.95, 0.4 + title.value.trim().length / 40),
        kind: "heading",
      });
    }

    content
      .querySelectorAll<HTMLElement>(
        ".learning-editor h1, .learning-editor h2, .learning-editor h3, .learning-editor p, .learning-editor pre, .learning-editor li",
      )
      .forEach((node) => {
        if (!(node.textContent ?? "").trim() && !node.querySelector("img, br")) {
          return;
        }
        const rect = node.getBoundingClientRect();
        const top =
          (rect.top - contentTop + scroll.scrollTop) / writtenHeight;
        const height = Math.max(rect.height / writtenHeight, 0.01);
        const textLen = (node.textContent ?? "").trim().length;
        const kind = node.matches("h1, h2, h3")
          ? "heading"
          : node.matches("pre")
            ? "code"
            : "text";
        nextBlocks.push({
          top,
          height,
          width: Math.min(0.95, 0.25 + textLen / 180),
          kind,
        });
      });

    const nextClaims: ClaimMark[] = [];
    content.querySelectorAll<HTMLElement>("[data-claim-id]").forEach((node) => {
      const id = node.dataset.claimId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      nextClaims.push({
        id,
        top: (rect.top - contentTop + scroll.scrollTop) / writtenHeight,
        height: Math.max(rect.height / writtenHeight, 0.02),
      });
    });

    setBlocks(nextBlocks);
    setClaims(nextClaims);
    setViewport({
      top: scroll.scrollTop / writtenHeight,
      height: Math.min(1, viewHeight / writtenHeight),
    });
    setReady(true);
  }, [contentRef, scrollRef]);

  useEffect(() => {
    measure();
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll) return;

    const onScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const writtenHeight = measureWrittenHeight(el, scroll.scrollTop);
      const viewHeight = Math.max(scroll.clientHeight, 1);
      setViewport({
        top: scroll.scrollTop / writtenHeight,
        height: Math.min(1, viewHeight / writtenHeight),
      });
    };

    scroll.addEventListener("scroll", onScroll, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" && content
        ? new ResizeObserver(() => measure())
        : null;
    observer?.observe(content!);

    return () => {
      scroll.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [contentRef, measure, revision, scrollRef]);

  function jumpTo(clientY: number, target: HTMLElement) {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientY - rect.top) / Math.max(rect.height, 1)),
    );
    const writtenHeight = measureWrittenHeight(content, scroll.scrollTop);
    scroll.scrollTo({
      top: ratio * writtenHeight - scroll.clientHeight / 2,
      behavior: "smooth",
    });
  }

  if (!ready) return null;

  return (
    <aside
      className="relative hidden w-14 shrink-0 self-stretch border-l border-border bg-black sm:block"
      aria-label="Document minimap"
    >
      <div
        className="absolute left-1 right-1 top-1 cursor-pointer overflow-hidden rounded-md border border-[#2a2a2a] bg-[#0a0a0a]"
        style={{
          height: `max(2.5rem, calc(${mapFill * 100}% - 0.25rem))`,
        }}
        onClick={(event) => jumpTo(event.clientY, event.currentTarget)}
      >
        <div className="pointer-events-none absolute inset-1">
          {blocks.map((block, index) => (
            <div
              key={`${block.kind}-${index}`}
              className={
                block.kind === "heading"
                  ? "absolute left-0 rounded-[1px] bg-[#3a3a3a]"
                  : block.kind === "code"
                    ? "absolute left-0 rounded-[1px] bg-[#222]"
                    : "absolute left-0 rounded-[1px] bg-[#2a2a2a]"
              }
              style={{
                top: `${block.top * 100}%`,
                height: `${Math.max(block.height * 100, 1.2)}%`,
                width: `${block.width * 100}%`,
              }}
            />
          ))}
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="absolute right-0 w-1 rounded-sm bg-red-500"
              style={{
                top: `${claim.top * 100}%`,
                height: `${Math.max(claim.height * 100, 1.5)}%`,
              }}
            />
          ))}
          <div
            className="absolute inset-x-0 rounded-sm border border-white/25 bg-white/10"
            style={{
              top: `${viewport.top * 100}%`,
              height: `${Math.max(viewport.height * 100, 8)}%`,
            }}
          />
        </div>
      </div>
    </aside>
  );
}
