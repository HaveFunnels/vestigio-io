import dagre from "dagre";
import type { MapNode, MapEdge } from "../types";

export interface LayoutConfig {
  direction: "LR" | "TB"; // left-to-right or top-to-bottom
  rankSeparation: number; // distance between columns/ranks (default 250)
  nodeSeparation: number; // distance between nodes in same rank (default 80)
  nodeWidth: number; // default node width for layout calc (default 200)
  nodeHeight: number; // default node height (default 60)
}

const DEFAULT_CONFIG: LayoutConfig = {
  direction: "LR",
  rankSeparation: 280,
  nodeSeparation: 100,
  nodeWidth: 250,
  nodeHeight: 90,
};

export function applyDagreLayout(
  nodes: MapNode[],
  edges: MapEdge[],
  config: Partial<LayoutConfig> = {},
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: cfg.direction,
    ranksep: cfg.rankSeparation,
    nodesep: cfg.nodeSeparation,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: cfg.nodeWidth, height: cfg.nodeHeight });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = {
        x: pos.x - cfg.nodeWidth / 2,
        y: pos.y - cfg.nodeHeight / 2,
      };
    }
  }
}
