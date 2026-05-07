"use client";

/**
 * Journey Map ELK Layout — Produces stage-lane grouped layout
 *
 * Uses ELK's layered algorithm to:
 * 1. Position nodes in left-to-right flow (by funnel stage)
 * 2. Minimize edge crossings
 * 3. Produce stage group nodes for visual lanes
 *
 * Returns: React Flow nodes (including group nodes for lanes) + edges
 */

import ELK from "elkjs/lib/elk.bundled.js";
import { MarkerType, Position, type Node, type Edge } from "@xyflow/react";
import type { MapDefinition } from "../../../packages/maps";

// Stage lane colors (tailwind token → actual classes applied in CSS)
const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:    { bg: "rgba(59,130,246,0.05)", border: "rgba(59,130,246,0.15)", text: "#60a5fa" },
  violet:  { bg: "rgba(139,92,246,0.05)", border: "rgba(139,92,246,0.15)", text: "#a78bfa" },
  amber:   { bg: "rgba(245,158,11,0.05)", border: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  red:     { bg: "rgba(239,68,68,0.05)",  border: "rgba(239,68,68,0.15)",  text: "#f87171" },
  emerald: { bg: "rgba(16,185,129,0.05)", border: "rgba(16,185,129,0.15)", text: "#34d399" },
  zinc:    { bg: "rgba(161,161,170,0.03)", border: "rgba(161,161,170,0.1)", text: "#a1a1aa" },
};

const elk = new ELK();

interface StageInfo {
  key: string;
  label: string;
  color: string;
  order: number;
}

export async function computeJourneyLayout(
  mapDef: MapDefinition,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Extract stage info from node metadata
  const stageMap = new Map<string, StageInfo>();
  const nodesByStage = new Map<string, string[]>();

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
    list.push(n.id);
  }

  // Sort stages by order
  const stages = [...stageMap.values()].sort((a, b) => a.order - b.order);

  // Build ELK graph
  const elkChildren = mapDef.nodes.map(n => ({
    id: n.id,
    width: n.type === "journey_support" ? 180 : 200,
    height: n.type === "journey_support" ? 55 : 80,
    layoutOptions: {
      "elk.partitioning.partition": String((n.metadata?.stage as number) ?? 99),
    },
  }));

  const edgeDedup = new Set<string>();
  const elkEdges = mapDef.edges
    .filter(e => {
      const key = `${e.source}->${e.target}`;
      if (edgeDedup.has(key)) return false;
      edgeDedup.add(key);
      return true;
    })
    .map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    }));

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.edgeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "30",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.partitioning.activate": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: elkChildren,
    edges: elkEdges,
  };

  let layoutResult;
  try {
    layoutResult = await elk.layout(graph);
  } catch {
    // ELK failed — fall back to simple grid positioning
    return buildFallbackLayout(mapDef, stages, nodesByStage);
  }

  // Build position map from ELK result
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const child of layoutResult.children || []) {
    positionMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  // Compute stage lane bounding boxes from positioned nodes
  const stageBounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
  for (const n of mapDef.nodes) {
    const stageKey = (n.metadata?.stageKey as string) || "other";
    const pos = positionMap.get(n.id);
    if (!pos) continue;
    const nodeW = n.type === "journey_support" ? 180 : 200;
    const nodeH = n.type === "journey_support" ? 55 : 80;

    let bounds = stageBounds.get(stageKey);
    if (!bounds) {
      bounds = { minX: pos.x, maxX: pos.x + nodeW, minY: pos.y, maxY: pos.y + nodeH };
      stageBounds.set(stageKey, bounds);
    } else {
      bounds.minX = Math.min(bounds.minX, pos.x);
      bounds.maxX = Math.max(bounds.maxX, pos.x + nodeW);
      bounds.minY = Math.min(bounds.minY, pos.y);
      bounds.maxY = Math.max(bounds.maxY, pos.y + nodeH);
    }
  }

  // Find global Y bounds for consistent lane heights
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;
  for (const b of stageBounds.values()) {
    globalMinY = Math.min(globalMinY, b.minY);
    globalMaxY = Math.max(globalMaxY, b.maxY);
  }
  const lanePadding = 40;
  const laneHeaderHeight = 36;

  // Create group nodes for stage lanes
  const groupNodes: Node[] = [];
  for (const stage of stages) {
    const bounds = stageBounds.get(stage.key);
    if (!bounds) continue;
    const colors = STAGE_COLORS[stage.color] || STAGE_COLORS.zinc;

    groupNodes.push({
      id: `stage_${stage.key}`,
      type: "group",
      position: {
        x: bounds.minX - lanePadding,
        y: globalMinY - lanePadding - laneHeaderHeight,
      },
      style: {
        width: bounds.maxX - bounds.minX + lanePadding * 2,
        height: globalMaxY - globalMinY + lanePadding * 2 + laneHeaderHeight,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: 12,
        padding: 0,
      },
      data: {
        label: stage.label,
        stageKey: stage.key,
        stageColor: colors.text,
      },
      selectable: false,
      draggable: false,
    });
  }

  // Build ReactFlow nodes (with parent group reference removed — group nodes
  // in React Flow are positioned absolutely, child nodes also positioned absolutely)
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

  // Build edges with arrow markers + thickness by weight
  const rfEdges: Edge[] = mapDef.edges.map(e => {
    const weight = (e.metadata?.linkWeight as number) ?? 0.5;
    const isHighWeight = weight >= 0.7;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "transition",
      animated: isHighWeight,
      label: e.label || undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: e.type === "redirect" ? "#f59e0b" : isHighWeight ? "#3b82f6" : "#52525b",
      },
      style: {
        strokeWidth: isHighWeight ? 2.5 : 1.5,
        stroke: e.type === "redirect" ? "#f59e0b" : isHighWeight ? "#3b82f6" : "#52525b",
        opacity: isHighWeight ? 1 : 0.6,
      },
      data: {
        severity: null,
        weight,
      },
      labelStyle: {
        fill: "#a1a1aa",
        fontSize: 10,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      labelBgStyle: { fill: "rgba(24,24,27,0.6)" },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    };
  });

  return { nodes: [...groupNodes, ...rfNodes], edges: rfEdges };
}

// Fallback: simple grid when ELK fails
function buildFallbackLayout(
  mapDef: MapDefinition,
  stages: StageInfo[],
  nodesByStage: Map<string, string[]>,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = [];
  const stageX: Record<string, number> = {};
  let currentX = 0;

  for (const stage of stages) {
    stageX[stage.key] = currentX;
    const stageNodes = nodesByStage.get(stage.key) || [];
    for (let i = 0; i < stageNodes.length; i++) {
      const mapNode = mapDef.nodes.find(n => n.id === stageNodes[i]);
      if (!mapNode) continue;
      rfNodes.push({
        id: mapNode.id,
        type: mapNode.type,
        position: { x: currentX, y: i * 120 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: mapNode.label, ...mapNode.metadata },
      });
    }
    currentX += 320;
  }

  const rfEdges: Edge[] = mapDef.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "transition",
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#3b82f6" },
    style: { strokeWidth: 1.5, stroke: "#3b82f6" },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}
