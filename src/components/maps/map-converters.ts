// ──────────────────────────────────────────────
// Conversion functions: MapDefinition -> ReactFlow nodes/edges
// ──────────────────────────────────────────────

import type { Node, Edge } from "@xyflow/react";
import type { MapDefinition } from "../../../packages/maps";

export function toReactFlowNodes(mapDef: MapDefinition): Node[] {
  return mapDef.nodes.map((n, index) => ({
    id: n.id,
    type: n.type,
    // Dagre produces real positions — no manual scaling needed
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.label,
      severity: n.severity,
      impact: n.impact,
      pack: n.pack,
      ...n.metadata,
    },
    className: "map-node-enter",
    style: { animationDelay: `${index * 0.05}s` },
  }));
}

export function toReactFlowEdges(mapDef: MapDefinition): Edge[] {
  return mapDef.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    // Use custom edge types that match our edge component registry
    type: e.type,
    animated: e.type === "causal",
    // Compact pill-style label at mid-edge (drop-off / conversion %).
    labelStyle: {
      fill: "var(--color-content-secondary, #a1a1aa)",
      fontSize: 10,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    labelBgStyle: {
      fill: "var(--color-surface-card, rgba(24,24,27,0.85))",
      fillOpacity: 0.9,
    },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
  }));
}
