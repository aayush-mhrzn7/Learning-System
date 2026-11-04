"use client";

import * as d3 from "d3";
import { GraphStar, LoaderCircle, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { NoteKind } from "@/lib/types";

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

function nodeRadius(node: SimNode) {
  if (node.type === "root") return 10 + Math.min(node.degree, 12) * 0.6;
  if (node.type === "directory") return 7 + Math.min(node.degree, 10) * 0.55;
  return 3.5 + Math.min(node.degree, 6) * 0.35;
}

function nodeFill(node: SimNode) {
  if (node.type === "root") return "#e8e8e8";
  if (node.type === "directory") return "#7dcea0";
  if (node.kind === "visualize") return "#9aa3c7";
  return "#c8c8c8";
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

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);

  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  }, [onOpenNote]);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/graph");
      if (!response.ok) throw new Error("Could not load graph");
      const data = (await response.json()) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      };
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load graph",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

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

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const viewport = svg.append("g");

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
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
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 18),
      );

    const link = viewport
      .append("g")
      .attr("stroke", "#3a3a3a")
      .attr("stroke-opacity", 0.85)
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
        d3
          .drag<SVGGElement, SimNode>()
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

    node
      .append("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => nodeFill(d))
      .attr("stroke", "none");

    const label = node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d) + 12)
      .attr("fill", (d) =>
        d.type === "directory" || d.type === "root" ? "#ddd" : "#aaa",
      )
      .attr("font-size", 11)
      .attr("paint-order", "stroke")
      .attr("stroke", "#1a1a1a")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .text((d) =>
        d.title.length > 24 ? `${d.title.slice(0, 22).trimEnd()}…` : d.title,
      );

    function syncLabelScale(scale: number) {
      // Keep label screen size ~constant while the graph zooms.
      label
        .attr("font-size", 11 / scale)
        .attr("stroke-width", 3 / scale)
        .attr("dy", (d) => nodeRadius(d) + 10 / scale);
    }

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 4])
        .on("zoom", (event) => {
          viewport.attr("transform", event.transform.toString());
          syncLabelScale(event.transform.k);
        }),
    );

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, loading]);

  const hasContent = nodes.some((node) => node.type !== "root");

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
      {sidebarCollapsed ? (
        <button
          onClick={onOpenSidebar}
          className="icon-button absolute left-3 top-3 z-10 sm:left-4 sm:top-4"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      ) : null}

      <div className="flex shrink-0 items-center gap-3 border-b border-[#1e1e1e] px-4 py-3 sm:px-6">
        <GraphStar size={16} className="text-[#aaa]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-medium text-[#eee]">Knowledge graph</h1>
          <p className="text-xs text-[#777]">
            Drag nodes · scroll to zoom · click a note to open
            {hoveredTitle ? (
              <span className="text-[#bbb]"> · {hoveredTitle}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {loading ? (
          <div className="grid h-full place-items-center text-xs text-[#777]">
            <span className="inline-flex items-center gap-2">
              <LoaderCircle size={14} className="animate-spin" />
              Loading graph…
            </span>
          </div>
        ) : !hasContent ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-[#777]">
            Create a directory and some notes — they show up here as a graph.
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="h-full w-full bg-[#1a1a1a]"
            role="img"
            aria-label="Directory knowledge graph"
          />
        )}
      </div>
    </main>
  );
}
