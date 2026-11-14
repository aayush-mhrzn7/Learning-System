"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type ClaimMark = { id: string; top: number; height: number };
type Viewport = { top: number; height: number };

function offsetInContent(el: Element, content: HTMLElement) {
  const contentTop = content.getBoundingClientRect().top;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - contentTop,
    bottom: rect.bottom - contentTop,
    height: rect.height,
  };
}

function contentOrigin(scroll: HTMLElement, content: HTMLElement) {
  return (
    content.getBoundingClientRect().top -
    scroll.getBoundingClientRect().top +
    scroll.scrollTop
  );
}

function measureWrittenHeight(content: HTMLElement): number {
  let bottom = 0;
  const title = content.querySelector("textarea, input");
  if (title) bottom = Math.max(bottom, offsetInContent(title, content).bottom);

  const editor = content.querySelector(".learning-editor");
  if (editor) {
    const kids = editor.querySelectorAll(":scope > *");
    if (kids.length === 0) {
      bottom = Math.max(bottom, offsetInContent(editor, content).bottom);
    } else {
      kids.forEach((node) => {
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [claims, setClaims] = useState<ClaimMark[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ top: 0, height: 1 });
  const [mapFill, setMapFill] = useState(0.12);

  useEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    const track = trackRef.current;
    const mirror = mirrorRef.current;
    if (!scroll || !content || !track || !mirror) return;

    const paint = () => {
      const written = measureWrittenHeight(content);
      const viewH = Math.max(scroll.clientHeight, 1);
      const fill = Math.min(1, written / viewH);
      setMapFill(fill);

      const contentW = Math.max(content.clientWidth, 1);
      const asideH = track.parentElement?.clientHeight ?? viewH;
      const mapH = Math.max(Math.max(40, fill * asideH - 4) - 8, 1);
      const mapW = Math.max(track.clientWidth - 8, 1);

      mirror.replaceChildren();
      const title = content.querySelector("textarea, input");
      if (
        title instanceof HTMLTextAreaElement ||
        title instanceof HTMLInputElement
      ) {
        const el = document.createElement("div");
        el.className = title.className;
        el.textContent = title.value;
        mirror.append(el);
      }
      const editor = content.querySelector(".learning-editor");
      if (editor) {
        const clone = editor.cloneNode(true) as HTMLElement;
        clone.contentEditable = "false";
        clone.inert = true;
        mirror.append(clone);
      }

      const pad = getComputedStyle(content);
      mirror.style.boxSizing = "border-box";
      mirror.style.width = `${contentW}px`;
      mirror.style.height = `${written}px`;
      mirror.style.paddingTop = pad.paddingTop;
      mirror.style.paddingLeft = pad.paddingLeft;
      mirror.style.paddingRight = pad.paddingRight;
      mirror.style.paddingBottom = "0";
      mirror.style.transform = `scale(${mapW / contentW}, ${mapH / written})`;

      const next: ClaimMark[] = [];
      content.querySelectorAll<HTMLElement>("[data-claim-id]").forEach((node) => {
        const id = node.dataset.claimId;
        if (!id) return;
        const { top, height } = offsetInContent(node, content);
        next.push({
          id,
          top: top / written,
          height: Math.max(height / written, 0.02),
        });
      });
      setClaims(next);

      const origin = contentOrigin(scroll, content);
      setViewport({
        top: Math.max(0, (scroll.scrollTop - origin) / written),
        height: Math.min(1, viewH / written),
      });
    };

    const onScroll = () => {
      const written = measureWrittenHeight(content);
      const origin = contentOrigin(scroll, content);
      setViewport({
        top: Math.max(0, (scroll.scrollTop - origin) / written),
        height: Math.min(1, scroll.clientHeight / written),
      });
    };

    paint();
    scroll.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(paint);
    ro.observe(content);
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [contentRef, revision, scrollRef]);

  function scrollTo(contentY: number) {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    scroll.scrollTo({
      top: contentOrigin(scroll, content) + contentY - scroll.clientHeight / 2,
      behavior: "smooth",
    });
  }

  return (
    <aside
      className="relative hidden w-14 shrink-0 self-stretch border-l border-border bg-muted/50 sm:block"
      aria-label="Document minimap"
    >
      <div
        ref={trackRef}
        className="absolute left-1 right-1 top-1 cursor-pointer overflow-hidden rounded-md border border-border bg-card"
        style={{ height: `max(2.5rem, calc(${mapFill * 100}% - 0.25rem))` }}
        onClick={(event) => {
          const content = contentRef.current;
          if (!content) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(
            1,
            Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1)),
          );
          scrollTo(ratio * measureWrittenHeight(content));
        }}
      >
        <div className="pointer-events-none absolute inset-1 overflow-hidden">
          <div
            ref={mirrorRef}
            aria-hidden
            className="absolute top-0 left-0 origin-top-left select-none"
          />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 rounded-sm border border-theme-accent/40 bg-theme-accent-soft"
          style={{
            top: `${viewport.top * 100}%`,
            height: `${Math.max(viewport.height * 100, 8)}%`,
          }}
        />
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
              const content = contentRef.current;
              const node = content?.querySelector<HTMLElement>(
                `[data-claim-id="${CSS.escape(claim.id)}"]`,
              );
              if (!content || !node) return;
              const { top, height } = offsetInContent(node, content);
              scrollTo(top + height / 2);
            }}
          />
        ))}
      </div>
    </aside>
  );
}
