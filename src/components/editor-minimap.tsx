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

/** Y of `el` relative to the top of `content` (scroll-independent). */
function offsetInContent(el: Element, content: HTMLElement) {
  const contentTop = content.getBoundingClientRect().top;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - contentTop,
    bottom: rect.bottom - contentTop,
    height: rect.height,
  };
}

/** Distance from the scrollport's content origin to the article top. */
function contentOrigin(scroll: HTMLElement, content: HTMLElement) {
  return (
    content.getBoundingClientRect().top -
    scroll.getBoundingClientRect().top +
    scroll.scrollTop
  );
}

/** Height of title + editor body only — ignores article bottom padding. */
function measureWrittenHeight(content: HTMLElement): number {
  let bottom = 0;

  const title = content.querySelector("input");
  if (title) {
    bottom = Math.max(bottom, offsetInContent(title, content).bottom);
  }

  const editor = content.querySelector(".learning-editor");
  if (editor) {
    const children = editor.querySelectorAll(":scope > *");
    if (children.length === 0) {
      bottom = Math.max(bottom, offsetInContent(editor, content).bottom);
    } else {
      children.forEach((node) => {
        bottom = Math.max(bottom, offsetInContent(node, content).bottom);
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
    const writtenHeight = measureWrittenHeight(content);
    const origin = contentOrigin(scroll, content);
    setMapFill(Math.min(1, writtenHeight / viewHeight));

    const nextBlocks: BlockMark[] = [];

    const title = content.querySelector("input");
    if (title && title.value.trim()) {
      const { top, height } = offsetInContent(title, content);
      nextBlocks.push({
        top: top / writtenHeight,
        height: Math.max(height / writtenHeight, 0.02),
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
        const { top, height } = offsetInContent(node, content);
        const textLen = (node.textContent ?? "").trim().length;
        const kind = node.matches("h1, h2, h3")
          ? "heading"
          : node.matches("pre")
            ? "code"
            : "text";
        nextBlocks.push({
          top: top / writtenHeight,
          height: Math.max(height / writtenHeight, 0.01),
          width: Math.min(0.95, 0.25 + textLen / 180),
          kind,
        });
      });

    const nextClaims: ClaimMark[] = [];
    content.querySelectorAll<HTMLElement>("[data-claim-id]").forEach((node) => {
      const id = node.dataset.claimId;
      if (!id) return;
      const { top, height } = offsetInContent(node, content);
      nextClaims.push({
        id,
        top: top / writtenHeight,
        height: Math.max(height / writtenHeight, 0.02),
      });
    });

    setBlocks(nextBlocks);
    setClaims(nextClaims);
    setViewport({
      top: Math.max(0, (scroll.scrollTop - origin) / writtenHeight),
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
      const writtenHeight = measureWrittenHeight(el);
      const viewHeight = Math.max(scroll.clientHeight, 1);
      const origin = contentOrigin(scroll, el);
      setViewport({
        top: Math.max(0, (scroll.scrollTop - origin) / writtenHeight),
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

  function scrollToContentY(contentY: number) {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    const origin = contentOrigin(scroll, content);
    scroll.scrollTo({
      top: origin + contentY - scroll.clientHeight / 2,
      behavior: "smooth",
    });
  }

  function jumpToRatio(clientY: number, target: HTMLElement) {
    const content = contentRef.current;
    if (!content) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientY - rect.top) / Math.max(rect.height, 1)),
    );
    scrollToContentY(ratio * measureWrittenHeight(content));
  }

  function jumpToClaim(claimId: string) {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    const node = content.querySelector<HTMLElement>(
      `[data-claim-id="${CSS.escape(claimId)}"]`,
    );
    if (!node) return;
    const { top, height } = offsetInContent(node, content);
    scrollToContentY(top + height / 2);
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
        onClick={(event) => jumpToRatio(event.clientY, event.currentTarget)}
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
          <div
            className="absolute inset-x-0 rounded-sm border border-white/25 bg-white/10"
            style={{
              top: `${viewport.top * 100}%`,
              height: `${Math.max(viewport.height * 100, 8)}%`,
            }}
          />
        </div>
        {claims.map((claim) => (
          <button
            key={claim.id}
            type="button"
            title="Jump to flagged claim"
            aria-label="Jump to flagged claim"
            className="absolute right-0.5 z-10 w-1.5 cursor-pointer rounded-sm bg-red-500 hover:bg-red-400"
            style={{
              top: `${claim.top * 100}%`,
              height: `${Math.max(claim.height * 100, 2)}%`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              jumpToClaim(claim.id);
            }}
          />
        ))}
      </div>
    </aside>
  );
}
