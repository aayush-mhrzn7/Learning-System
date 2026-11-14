"use client";

import { select } from "d3";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { VisualizeDiagram } from "@/db/schema";

type LayoutNode = {
  id: string;
  label: string;
  rank: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutEdge = {
  source: string;
  target: string;
  label?: string;
};

const PAD_X = 48;
const PAD_Y = 40;
const NODE_H = 32;
const RANK_GAP = 88;
const COL_GAP = 28;
const MIN_NODE_W = 72;

function estimateWidth(label: string) {
  // ~6.6px per char at 11px — good enough without measuring first.
  return Math.max(MIN_NODE_W, Math.min(280, label.length * 6.6 + 28));
}

/** Longest-path ranks from sources → sinks (top to bottom). */
function assignRanks(
  nodeIds: string[],
  edges: { source: string; target: string }[],
) {
  const ids = new Set(nodeIds);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    indegree.set(id, 0);
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  // Cycles / no roots: fall back to declaration order as a single column.
  if (queue.length === 0) {
    nodeIds.forEach((id, index) => rank.set(id, index));
    return rank;
  }

  for (const id of queue) rank.set(id, 0);
  const remaining = new Map(indegree);
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const base = rank.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, base + 1));
      const left = (remaining.get(next) ?? 1) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  // Any leftover (cycle): park after max rank in input order.
  let max = 0;
  for (const value of rank.values()) max = Math.max(max, value);
  for (const id of nodeIds) {
    if (!rank.has(id)) {
      max += 1;
      rank.set(id, max);
    }
  }
  return rank;
}

function layoutDiagram(diagram: VisualizeDiagram, width: number) {
  const edges: LayoutEdge[] = diagram.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    label: edge.label,
  }));
  const ranks = assignRanks(
    diagram.nodes.map((n) => n.id),
    edges,
  );

  const byRank = new Map<number, LayoutNode[]>();
  for (const node of diagram.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const widthPx = estimateWidth(node.label);
    const laid: LayoutNode = {
      id: node.id,
      label: node.label,
      rank,
      x: 0,
      y: 0,
      width: widthPx,
      height: NODE_H,
    };
    const list = byRank.get(rank) ?? [];
    list.push(laid);
    byRank.set(rank, list);
  }

  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);
  let maxRowWidth = 0;
  for (const key of rankKeys) {
    const row = byRank.get(key)!;
    const rowWidth =
      row.reduce((sum, n) => sum + n.width, 0) +
      Math.max(0, row.length - 1) * COL_GAP;
    maxRowWidth = Math.max(maxRowWidth, rowWidth);
  }

  const contentWidth = Math.max(width - PAD_X * 2, maxRowWidth);
  const nodes: LayoutNode[] = [];

  for (const key of rankKeys) {
    const row = byRank.get(key)!;
    const rowWidth =
      row.reduce((sum, n) => sum + n.width, 0) +
      Math.max(0, row.length - 1) * COL_GAP;
    let x = PAD_X + (contentWidth - rowWidth) / 2;
    const y = PAD_Y + key * RANK_GAP + NODE_H / 2;
    for (const node of row) {
      node.x = x + node.width / 2;
      node.y = y;
      x += node.width + COL_GAP;
      nodes.push(node);
    }
  }

  const height =
    PAD_Y * 2 +
    Math.max(1, rankKeys.length) * NODE_H +
    Math.max(0, rankKeys.length - 1) * (RANK_GAP - NODE_H);

  return {
    nodes,
    edges,
    width: Math.max(width, contentWidth + PAD_X * 2),
    height: Math.max(240, height),
  };
}

function edgePoints(
  source: LayoutNode,
  target: LayoutNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = source.x;
  const y1 = source.y + source.height / 2;
  const x2 = target.x;
  const y2 = target.y - target.height / 2;
  return { x1, y1, x2, y2 };
}

async function svgToPngBlob(svgEl: SVGSVGElement): Promise<Blob> {
  const viewBox = svgEl.viewBox.baseVal;
  const width = viewBox.width || svgEl.clientWidth || 640;
  const height = viewBox.height || svgEl.clientHeight || 240;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  // The serialized SVG is rendered standalone, so CSS variables and Tailwind
  // classes do not resolve — inline the computed colors and paint the background.
  const bgColor = getComputedStyle(svgEl).backgroundColor;
  const sources = svgEl.querySelectorAll("*");
  const copies = clone.querySelectorAll("*");
  sources.forEach((source, index) => {
    const copy = copies[index];
    if (!copy) return;
    const computed = getComputedStyle(source);
    if (computed.fill) copy.setAttribute("fill", computed.fill);
    if (computed.stroke) copy.setAttribute("stroke", computed.stroke);
    copy.removeAttribute("style");
  });
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", bgColor);
  clone.insertBefore(bg, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("png encode failed"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VisualizeDiagramView({
  diagram,
}: {
  diagram: VisualizeDiagram;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const svgEl = ref.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth || 640;
    const layout = layoutDiagram(diagram, width);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));

    const svg = select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svgEl.style.height = `${layout.height}px`;

    const g = svg.append("g");

    svg
      .append("defs")
      .append("marker")
      .attr("id", "viz-arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .style("fill", "color-mix(in oklab, var(--foreground) 55%, transparent)");

    const resolvedEdges = layout.edges
      .map((edge) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        return { ...edge, ...edgePoints(source, target) };
      })
      .filter(Boolean) as Array<
      LayoutEdge & { x1: number; y1: number; x2: number; y2: number }
    >;

    g.append("g")
      .attr("fill", "none")
      .style("stroke", "color-mix(in oklab, var(--foreground) 40%, transparent)")
      .attr("stroke-width", 1.4)
      .selectAll("path")
      .data(resolvedEdges)
      .join("path")
      .attr("marker-end", "url(#viz-arrow)")
      .attr("d", (d) => {
        const midY = (d.y1 + d.y2) / 2;
        return `M${d.x1},${d.y1} C${d.x1},${midY} ${d.x2},${midY} ${d.x2},${d.y2}`;
      });

    g.append("g")
      .selectAll("text")
      .data(resolvedEdges.filter((edge) => edge.label))
      .join("text")
      .style("fill", "var(--muted-foreground)")
      .attr("font-size", 12)
      .attr("text-anchor", "middle")
      .attr("x", (d) => (d.x1 + d.x2) / 2)
      .attr("y", (d) => (d.y1 + d.y2) / 2 - 6)
      .text((d) => d.label ?? "");

    const node = g
      .append("g")
      .selectAll("g")
      .data(layout.nodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    node
      .append("rect")
      .attr("x", (d) => -d.width / 2)
      .attr("y", (d) => -d.height / 2)
      .attr("width", (d) => d.width)
      .attr("height", (d) => d.height)
      .attr("rx", 8)
      .attr("ry", 8)
      .style("fill", "var(--secondary)")
      .style("stroke", "color-mix(in oklab, var(--foreground) 28%, transparent)")
      .attr("stroke-width", 1);

    node
      .append("text")
      .style("fill", "var(--foreground)")
      .attr("font-size", 13)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text((d) => d.label);
  }, [diagram]);

  async function copyDiagram() {
    const svgEl = ref.current;
    if (!svgEl) return;
    try {
      const blob = await svgToPngBlob(svgEl);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      toast.success("Diagram copied — paste into a writing note");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy diagram");
    }
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => void copyDiagram()}
        className="absolute top-2 right-2 z-10 inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-popover/95 px-2 text-[12px] text-muted-foreground opacity-100 shadow-sm transition-colors hover:border-foreground/40 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        aria-label="Copy diagram"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <svg
        ref={ref}
        className="w-full rounded-lg border border-border bg-card"
        role="img"
        aria-label="Architecture diagram"
      />
    </div>
  );
}
