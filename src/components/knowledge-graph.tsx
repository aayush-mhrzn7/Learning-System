"use client";

import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  transition,
  zoom,
  zoomIdentity,
  type Selection,
  type ZoomBehavior,
} from "d3";

void transition;
import { GraphStar, PanelLeftOpen, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { aiToasts } from "@/lib/toast-messages";
import { Skeleton } from "@/components/ui/skeleton";
import type { NoteKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type GraphNode = {
  id: string;
  type: "root" | "directory" | "note";
  title: string;
  kind: NoteKind | null;
  directoryId?: string;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
};

type SimNode = GraphNode & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  degree: number;
};

type SimLink = {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
};

const LABEL_VISIBLE_AT = 1.35;

function nodeRadius(node: SimNode) {
  if (node.type === "root") return 10 + Math.min(node.degree, 12) * 0.6;
  if (node.type === "directory") return 7 + Math.min(node.degree, 10) * 0.55;
  return 3.5 + Math.min(node.degree, 6) * 0.35;
}

function nodeFill(node: SimNode) {
  if (node.type === "root") return "var(--foreground)";
  if (node.type === "directory") return "var(--theme-accent)";
  if (node.kind === "visualize") return "var(--theme-accent)";
  return "var(--muted-foreground)";
}

function appendNodeShape(
  selection: Selection<SVGGElement, SimNode, SVGGElement, unknown>,
) {
  selection.each(function (d) {
    const g = select(this);
    const r = nodeRadius(d);
    if (d.type === "note" && d.kind === "visualize") {
      g.append("rect")
        .attr("x", -r)
        .attr("y", -r)
        .attr("width", r * 2)
        .attr("height", r * 2)
        .attr("rx", 1.2)
        .attr("transform", "rotate(45)")
        .style("fill", nodeFill(d))
        .style("stroke", "var(--background)")
        .attr("stroke-width", 1);
      return;
    }
    g.append("circle")
      .attr("r", r)
      .style("fill", nodeFill(d));
  });
}

function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full transition-colors",
        checked ? "bg-theme-accent" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3 rounded-full bg-white transition-[left]",
          checked ? "left-3.5" : "left-0.5",
        )}
      />
    </button>
  );
}

export function KnowledgeGraph({
  sidebarCollapsed,
  onOpenSidebar,
  onOpenNote,
}: {
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
  onOpenNote: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const onOpenNoteRef = useRef(onOpenNote);
  const alwaysShowLabelsRef = useRef(false);
  const scaleRef = useRef(1);
  const labelSelRef =
    useRef<Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null>(
      null,
    );
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  }, [onOpenNote]);

  useEffect(() => {
    alwaysShowLabelsRef.current = alwaysShowLabels;
    const label = labelSelRef.current;
    if (!label) return;
    label.attr(
      "opacity",
      alwaysShowLabels || scaleRef.current >= LABEL_VISIBLE_AT ? 1 : 0,
    );
  }, [alwaysShowLabels]);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/graph");
      if (!response.ok) throw new Error(aiToasts.graphLoadFailed);
      const data = (await response.json()) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      };
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : aiToasts.graphLoadFailed,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const centerOnNodes = useCallback(() => {
    const svgEl = svgRef.current;
    const wrap = wrapRef.current;
    const zoomBehavior = zoomRef.current;
    const simNodes = simNodesRef.current;
    if (!svgEl || !wrap || !zoomBehavior || simNodes.length === 0) return;

    const width = wrap.clientWidth || 800;
    const height = Math.max(wrap.clientHeight || 560, 420);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of simNodes) {
      const r = nodeRadius(n);
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      minX = Math.min(minX, x - r);
      maxX = Math.max(maxX, x + r);
      minY = Math.min(minY, y - r);
      maxY = Math.max(maxY, y + r);
    }
    if (!Number.isFinite(minX)) return;

    const padding = 56;
    const graphW = Math.max(maxX - minX, 1);
    const graphH = Math.max(maxY - minY, 1);
    const scale = Math.min(
      4,
      Math.max(
        0.25,
        0.85 *
          Math.min(
            (width - padding * 2) / graphW,
            (height - padding * 2) / graphH,
          ),
      ),
    );
    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-(minX + maxX) / 2, -(minY + maxY) / 2);

    select(svgEl)
      .transition()
      .duration(450)
      .call(zoomBehavior.transform, transform);
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    const wrap = wrapRef.current;
    if (!svgEl || !wrap || loading) return;

    const width = wrap.clientWidth || 800;
    const height = Math.max(wrap.clientHeight || 560, 420);

    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }

    const simNodes: SimNode[] = nodes.map((node) => ({
      ...node,
      degree: degree.get(node.id) ?? 0,
    }));
    const simLinks: SimLink[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));
    simNodesRef.current = simNodes;

    const svg = select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const viewport = svg.append("g");

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            const source = d.source as SimNode;
            const target = d.target as SimNode;
            if (source.type === "root" || target.type === "root") return 90;
            if (source.type === "directory" && target.type === "directory")
              return 70;
            return 42;
          })
          .strength(0.85),
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => nodeRadius(d) + 18),
      )
      .alphaDecay(0.06)
      .alphaMin(0.03);

    const link = viewport
      .append("g")
      .style("stroke", "var(--border)")
      .attr("stroke-opacity", 1)
      .attr("stroke-width", 0.9)
      .selectAll("line")
      .data(simLinks)
      .join("line");

    const node = viewport
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .attr("class", (d) =>
        d.type === "note"
          ? "cursor-pointer"
          : "cursor-grab active:cursor-grabbing",
      )
      .call(
        drag<SVGGElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.28).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on("mouseenter", (_event, d) => {
        setHoveredTitle(d.title);
      })
      .on("mouseleave", () => {
        setHoveredTitle(null);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.type === "note") onOpenNoteRef.current(d.id);
      });

    appendNodeShape(node);

    const label = node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d) + 12)
      .style("fill", (d) =>
        d.type === "directory" || d.type === "root"
          ? "var(--foreground)"
          : d.kind === "visualize"
            ? "var(--theme-accent)"
            : "var(--muted-foreground)",
      )
      .attr("font-size", 11)
      .attr("paint-order", "stroke")
      .style("stroke", "var(--background)")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0)
      .text((d) =>
        d.title.length > 24 ? `${d.title.slice(0, 22).trimEnd()}…` : d.title,
      );
    labelSelRef.current = label;

    function syncLabelScale(scale: number) {
      scaleRef.current = scale;
      label
        .attr("font-size", 11 / scale)
        .attr("stroke-width", 3 / scale)
        .attr("dy", (d) => nodeRadius(d) + 10 / scale)
        .attr(
          "opacity",
          alwaysShowLabelsRef.current || scale >= LABEL_VISIBLE_AT ? 1 : 0,
        );
    }

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform.toString());
        syncLabelScale(event.transform.k);
      });
    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior);
    syncLabelScale(1);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      if (simulation.alpha() < 0.03) simulation.stop();
    });

    return () => {
      simulation.stop();
      zoomRef.current = null;
      labelSelRef.current = null;
      simNodesRef.current = [];
    };
  }, [nodes, edges, loading]);

  const hasContent = nodes.some((node) => node.type !== "root");

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {sidebarCollapsed ? (
        <button
          onClick={onOpenSidebar}
          className="icon-button absolute left-3 top-3 z-10 sm:left-4 sm:top-4"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      ) : null}

      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <GraphStar size={16} className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-medium text-foreground">Knowledge graph</h1>
          <p className="text-xs text-muted-foreground">
            Drag nodes · scroll to zoom · click a note to open
            <span className="text-muted-foreground">
              {" "}
              · <span className="text-muted-foreground">●</span> note ·{" "}
              <span className="text-theme-accent">◆</span> visualize
            </span>
            {hoveredTitle ? (
              <span className="text-foreground"> · {hoveredTitle}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {loading ? (
          <div
            className="relative grid h-full place-items-center bg-background"
            aria-busy="true"
            aria-label="Loading graph"
          >
            <div className="absolute inset-0 opacity-40">
              <Skeleton className="absolute left-[18%] top-[28%] size-3 rounded-full" />
              <Skeleton className="absolute left-[42%] top-[22%] size-3 rounded-full" />
              <Skeleton className="absolute left-[62%] top-[36%] size-3 rounded-full" />
              <Skeleton className="absolute left-[28%] top-[52%] size-3 rounded-full" />
              <Skeleton className="absolute left-[52%] top-[58%] size-3 rounded-full" />
              <Skeleton className="absolute left-[72%] top-[48%] size-3 rounded-full" />
              <Skeleton className="absolute left-[35%] top-[38%] h-px w-[18%]" />
              <Skeleton className="absolute left-[48%] top-[30%] h-px w-[14%]" />
              <Skeleton className="absolute left-[45%] top-[48%] h-px w-[16%]" />
            </div>
            <div className="relative z-10 flex flex-col items-center gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ) : !hasContent ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
            Create a directory and some notes — they show up here as a graph.
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              className="h-full w-full bg-background"
              role="img"
              aria-label="Directory knowledge graph"
            />
            <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2 sm:right-4">
              {optionsOpen ? (
                <div className="w-48 rounded-md border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-sm">
                  <p className="mb-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Options
                  </p>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs text-foreground">
                        Always show names
                      </span>
                      <Switch
                        checked={alwaysShowLabels}
                        onCheckedChange={setAlwaysShowLabels}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={centerOnNodes}
                      className="h-8 rounded-md border border-border bg-secondary px-2.5 text-xs text-foreground transition-colors hover:border-theme-accent hover:text-theme-accent"
                    >
                      Center on nodes
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="icon-button rounded-md border border-border bg-popover/90 backdrop-blur-sm"
                aria-label="Graph settings"
                aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen((open) => !open)}
              >
                <Settings size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
