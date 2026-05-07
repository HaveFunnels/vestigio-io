"use client";

/**
 * Journey Map Column Layout — Clean funnel visualization
 *
 * Manual column-based positioning (no ELK — it was causing overlapping
 * partitions and backward edge routing issues). Each funnel stage gets
 * a fixed X column. Nodes stack vertically within their column.
 *
 * Backward edges (target stage <= source stage) are filtered out to
 * prevent lines that wrap around and create visual noise.
 *
 * Stage lane group nodes are rendered as background columns with headers.
 */

import { MarkerType, Position, type Node, type Edge } from "@xyflow/react";
import type { MapDefinition } from "../../../packages/maps";

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:    { bg: "rgba(59,130,246,0.05)", border: "rgba(59,130,246,0.15)", text: "#60a5fa" },
  violet:  { bg: "rgba(139,92,246,0.05)", border: "rgba(139,92,246,0.15)", text: "#a78bfa" },
  amber:   { bg: "rgba(245,158,11,0.05)", border: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  red:     { bg: "rgba(239,68,68,0.05)",  border: "rgba(239,68,68,0.15)",  text: "#f87171" },
  emerald: { bg: "rgba(16,185,129,0.05)", border: "rgba(16,185,129,0.15)", text: "#34d399" },
  zinc:    { bg: "rgba(161,161,170,0.03)", border: "rgba(161,161,170,0.1)", text: "#a1a1aa" },
};

interface StageInfo {
  key: string;
  label: string;
  color: string;
  order: number;
}

const COLUMN_WIDTH = 240;
const COLUMN_GAP = 100;
const NODE_HEIGHT_COMMERCIAL = 80;
const NODE_HEIGHT_SUPPORT = 55;
const NODE_VERTICAL_GAP = 36;
const LANE_PADDING = 30;
const LANE_HEADER_HEIGHT = 40;

export async function computeJourneyLayout(
  mapDef: MapDefinition,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Group nodes by stage
  const stageMap = new Map<string, StageInfo>();
  const nodesByStage = new Map<string, typeof mapDef.nodes>();

  for (const n of mapDef.nodes) {
    const stageKey = (n.metadata?.stageKey as string) || "other";
    const stageLabel = (n.metadata?.stageLabel as string) || "Other";
    const stageColor = (n.metadata?.stageColor as string) || "zinc";
    const stageOrder = (n.metadata?.stage as number) ?? 99;

    if (!stageMap.has(stageKey)) {
      stageMap.set(stageKey, { key: stageKey, label: stageLabel, color: stageColor, order: stageOrder });
    }
    let list = nodesByStage.get(stageKey);
    if (!list) { list = []; nodesByStage.set(stageKey, list); }
    list.push(n);
  }

  const stages = [...stageMap.values()].sort((a, b) => a.order - b.order);

  // Position nodes in columns
  const positionMap = new Map<string, { x: number; y: number }>();
  const nodeStageOrder = new Map<string, number>(); // nodeId → stage order
  let maxNodesInColumn = 0;

  stages.forEach((stage, colIndex) => {
    const stageNodes = nodesByStage.get(stage.key) || [];
    maxNodesInColumn = Math.max(maxNodesInColumn, stageNodes.length);
    const colX = colIndex * (COLUMN_WIDTH + COLUMN_GAP);

    stageNodes.forEach((n, rowIndex) => {
      const nodeH = n.type === "journey_support" ? NODE_HEIGHT_SUPPORT : NODE_HEIGHT_COMMERCIAL;
      const y = LANE_HEADER_HEIGHT + LANE_PADDING + rowIndex * (nodeH + NODE_VERTICAL_GAP);
      positionMap.set(n.id, { x: colX + LANE_PADDING, y });
      nodeStageOrder.set(n.id, stage.order);
    });
  });

  // Compute total height for lane backgrounds
  const maxColumnHeight = LANE_HEADER_HEIGHT + LANE_PADDING * 2 +
    maxNodesInColumn * (NODE_HEIGHT_COMMERCIAL + NODE_VERTICAL_GAP);

  // Create stage lane group nodes
  const groupNodes: Node[] = stages.map((stage, colIndex) => {
    const colors = STAGE_COLORS[stage.color] || STAGE_COLORS.zinc;
    const colX = colIndex * (COLUMN_WIDTH + COLUMN_GAP);

    return {
      id: `stage_${stage.key}`,
      type: "group",
      position: { x: colX, y: 0 },
      style: {
        width: COLUMN_WIDTH + LANE_PADDING * 2,
        height: Math.max(maxColumnHeight, 200),
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderStyle: "solid" as const,
        borderRadius: 12,
        padding: 0,
        zIndex: -1,
      },
      data: {
        label: stage.label,
        stageKey: stage.key,
        stageColor: colors.text,
      },
      selectable: false,
      draggable: false,
    };
  });

  // Build page nodes
  const rfNodes: Node[] = mapDef.nodes.map((n, index) => {
    const pos = positionMap.get(n.id) || { x: 0, y: 0 };
    return {
      id: n.id,
      type: n.type,
      position: pos,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: n.label,
        severity: n.severity,
        impact: n.impact,
        pack: n.pack,
        _nodeIndex: index,
        ...n.metadata,
      },
    };
  });

  // Build edges — ONLY forward edges (source stage <= target stage)
  // Backward edges create visual loops that wrap around nodes
  const rfEdges: Edge[] = [];
  for (const e of mapDef.edges) {
    const sourceOrder = nodeStageOrder.get(e.source) ?? 99;
    const targetOrder = nodeStageOrder.get(e.target) ?? 99;

    // Skip backward edges (target is in an earlier or same stage)
    // These create the "lines going nowhere" and wrap-around artifacts
    if (targetOrder < sourceOrder) continue;

    const weight = (e.metadata?.linkWeight as number) ?? 0.5;
    const isHighWeight = weight >= 0.7;
    const isSameStage = sourceOrder === targetOrder;

    rfEdges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: isHighWeight && !isSameStage,
      label: e.label || undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: e.type === "redirect" ? "#f59e0b" : isHighWeight ? "#3b82f6" : "#52525b",
      },
      style: {
        strokeWidth: isHighWeight ? 2.5 : 1.2,
        stroke: e.type === "redirect" ? "#f59e0b" : isHighWeight ? "#3b82f6" : "#52525b",
        opacity: isHighWeight ? 1 : 0.5,
      },
      data: { severity: null, weight },
    });
  }

  return { nodes: [...groupNodes, ...rfNodes], edges: rfEdges };
}
