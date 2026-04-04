"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeTypes, Handle, Position,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ConsoleState from "@/components/console/ConsoleState";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import { loadAllMaps } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { MapDefinition, MapNode } from "../../../../packages/maps";

// ──────────────────────────────────────────────
// Format + Style
// ──────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

const severityColors: Record<string, string> = {
  critical: "border-red-500 bg-red-500/10",
  high: "border-red-400 bg-red-400/10",
  medium: "border-amber-400 bg-amber-400/10",
  low: "border-zinc-500 bg-zinc-500/10",
};

// ──────────────────────────────────────────────
// Custom Nodes
// ──────────────────────────────────────────────

function RootCauseNode({ data }: { data: any }) {
  return (
    <div className={`rounded-lg border-2 px-4 py-3 min-w-[200px] cursor-pointer transition-shadow hover:shadow-lg hover:shadow-red-500/10 ${severityColors[data.severity] || "border-zinc-600 bg-zinc-800/50"}`}>
      <Handle type="target" position={Position.Left} className="!bg-zinc-500" />
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Root Cause</div>
      <div className="mt-1 text-sm font-medium text-zinc-100">{data.label}</div>
      {data.impact && <div className="mt-1 text-xs font-mono text-red-400">{formatCurrency(data.impact.min)} – {formatCurrency(data.impact.max)}/mo</div>}
      <Handle type="source" position={Position.Right} className="!bg-zinc-500" />
    </div>
  );
}

function FindingNode({ data }: { data: any }) {
  return (
    <div className={`rounded-md border px-3 py-2 min-w-[180px] cursor-pointer transition-shadow hover:shadow-lg hover:shadow-amber-500/10 ${severityColors[data.severity] || "border-zinc-700 bg-zinc-800/50"}`}>
      <Handle type="target" position={Position.Left} className="!bg-zinc-500" />
      <div className="text-xs text-zinc-400">Finding</div>
      <div className="mt-0.5 text-sm text-zinc-200">{data.label}</div>
      {data.impact && <div className="mt-1 text-xs font-mono text-amber-400">{formatCurrency(data.impact.midpoint)}/mo</div>}
      <Handle type="source" position={Position.Right} className="!bg-zinc-500" />
    </div>
  );
}

function ActionNode({ data }: { data: any }) {
  return (
    <div className="rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 min-w-[180px] cursor-pointer transition-shadow hover:shadow-lg hover:shadow-emerald-500/10">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <div className="text-xs text-emerald-400">Action</div>
      <div className="mt-0.5 text-sm text-zinc-200">{data.label}</div>
      {data.impact && <div className="mt-1 text-xs font-mono text-emerald-400">unlocks {formatCurrency(data.impact.midpoint)}/mo</div>}
    </div>
  );
}

function CategoryNode({ data }: { data: any }) {
  return (
    <div className="rounded-md border border-blue-600/50 bg-blue-500/10 px-4 py-3 min-w-[160px]">
      <div className="text-sm font-semibold text-blue-400">{data.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  root_cause: RootCauseNode, finding: FindingNode, action: ActionNode,
  policy: CategoryNode, support: CategoryNode, trust: CategoryNode,
  measurement: CategoryNode, checkout: CategoryNode,
};

const edgeStyles: Record<string, any> = {
  causal: { stroke: "#ef4444", strokeWidth: 2 },
  contributes_to: { stroke: "#71717a", strokeWidth: 1.5, strokeDasharray: "5 5" },
  addresses: { stroke: "#10b981", strokeWidth: 2 },
  transition: { stroke: "#3b82f6", strokeWidth: 1.5 },
};

function toReactFlowNodes(mapDef: MapDefinition): Node[] {
  return mapDef.nodes.map((n) => ({
    id: n.id, type: n.type, position: n.position,
    data: { label: n.label, severity: n.severity, impact: n.impact, pack: n.pack, ...n.metadata },
  }));
}

function toReactFlowEdges(mapDef: MapDefinition): Edge[] {
  return mapDef.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, label: e.label || undefined,
    style: edgeStyles[e.type] || edgeStyles.causal, animated: e.type === "causal",
  }));
}

// ──────────────────────────────────────────────
// Tooltip
// ──────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  node: MapNode | null;
}

function NodeTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip.visible || !tooltip.node) return null;
  const { node } = tooltip;

  return (
    <div
      className="pointer-events-none fixed z-[60] rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl"
      style={{ left: tooltip.x + 12, top: tooltip.y - 8, maxWidth: 300 }}
    >
      <div className="text-sm font-medium text-zinc-100">{node.label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        {node.severity && (
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
            node.severity === "critical" ? "border-red-500/20 bg-red-500/10 text-red-400"
            : node.severity === "high" ? "border-orange-500/20 bg-orange-500/10 text-orange-400"
            : node.severity === "medium" ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
            : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
          }`}>
            {node.severity}
          </span>
        )}
        {node.impact && (
          <span className="text-xs font-mono text-zinc-400">
            {formatCurrency(node.impact.midpoint)}/mo
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Drawer Contents
// ──────────────────────────────────────────────

function FindingDrawerContent({ node }: { node: MapNode }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Summary</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {node.metadata.confidence != null && <span className="text-xs text-zinc-500">Confidence {String(node.metadata.confidence)}%</span>}
          {node.pack && <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{node.pack}</span>}
          {node.metadata.surface != null && <code className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">{String(node.metadata.surface)}</code>}
        </div>
      </section>

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Impact Breakdown</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
              <span className="text-xs text-zinc-500">Monthly Range</span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
              <span className="text-xs text-zinc-500">Midpoint</span>
              <ImpactBadge min={node.impact.midpoint} max={node.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ActionDrawerContent({ node }: { node: MapNode }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Action Details</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {node.metadata.action_type && (
            <span className="text-xs text-zinc-500">{String(node.metadata.action_type).replace(/_/g, " ")}</span>
          )}
          {node.metadata.cross_pack && (
            <span className="inline-flex rounded border border-emerald-800/50 px-2 py-0.5 text-xs text-emerald-400">cross-pack</span>
          )}
        </div>
      </section>

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Impact Unlocked</h3>
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Monthly Range</span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Midpoint</span>
              <ImpactBadge min={node.impact.midpoint} max={node.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RootCauseDrawerContent({ node }: { node: MapNode }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Root Cause Details</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {node.metadata.confidence != null && <span className="text-xs text-zinc-500">Confidence {String(node.metadata.confidence)}%</span>}
          {node.metadata.category && (
            <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{String(node.metadata.category)}</span>
          )}
        </div>
      </section>

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Aggregate Impact</h3>
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Monthly Range</span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Midpoint</span>
              <ImpactBadge min={node.impact.midpoint} max={node.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}

      {node.metadata.affected_packs && Array.isArray(node.metadata.affected_packs) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Affected Packs</h3>
          <div className="flex flex-wrap gap-2">
            {(node.metadata.affected_packs as string[]).map((pack) => (
              <span key={pack} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                {pack.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function MapsPage() {
  const mcpData = useMcpData();
  const dataState = mcpData.maps.status !== "not_ready" ? mcpData.maps : loadAllMaps();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-zinc-100">Maps</h1>
        <p className="mt-1 text-sm text-zinc-500">Causal visualization — see relationships between issues, root causes, and actions.</p>
      </div>

      <div className="flex-1">
        <ConsoleState
          state={dataState}
          loadingLabel="Generating maps..."
          emptyLabel="Run an analysis to generate causal maps."
        >
          {(maps) => <MapsContent maps={maps} />}
        </ConsoleState>
      </div>
    </div>
  );
}

function MapsContent({ maps }: { maps: MapDefinition[] }) {
  const [activeMap, setActiveMap] = useState<MapDefinition>(maps[0]);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, node: null });

  const nodes = useMemo(() => toReactFlowNodes(activeMap), [activeMap]);
  const edges = useMemo(() => toReactFlowEdges(activeMap), [activeMap]);

  // Build a lookup from node id -> MapNode for click/hover
  const nodeMap = useMemo(() => {
    const map = new Map<string, MapNode>();
    for (const n of activeMap.nodes) map.set(n.id, n);
    return map;
  }, [activeMap]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const mapNode = nodeMap.get(node.id);
    if (!mapNode) return;
    // Only open drawer for finding, action, or root_cause nodes
    if (mapNode.type === "finding" || mapNode.type === "action" || mapNode.type === "root_cause") {
      setSelectedNode(mapNode);
    }
  }, [nodeMap]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((event, node) => {
    const mapNode = nodeMap.get(node.id);
    if (!mapNode) return;
    setTooltip({ visible: true, x: event.clientX, y: event.clientY, node: mapNode });
  }, [nodeMap]);

  const onNodeMouseMove: NodeMouseHandler = useCallback((event) => {
    setTooltip((prev) => ({ ...prev, x: event.clientX, y: event.clientY }));
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setTooltip({ visible: false, x: 0, y: 0, node: null });
  }, []);

  // Determine drawer title and content based on selected node type
  const drawerTitle = selectedNode
    ? selectedNode.type === "finding" ? `Finding: ${selectedNode.label}`
    : selectedNode.type === "action" ? `Action: ${selectedNode.label}`
    : selectedNode.type === "root_cause" ? `Root Cause: ${selectedNode.label}`
    : selectedNode.label
    : "";

  const drawerContent = selectedNode
    ? selectedNode.type === "finding" ? <FindingDrawerContent node={selectedNode} />
    : selectedNode.type === "action" ? <ActionDrawerContent node={selectedNode} />
    : selectedNode.type === "root_cause" ? <RootCauseDrawerContent node={selectedNode} />
    : null
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Map selector */}
      <div className="border-b border-zinc-800 px-6 py-2">
        <div className="flex gap-2">
          {maps.map((m) => (
            <button key={m.id} onClick={() => { setActiveMap(m); setSelectedNode(null); }}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${activeMap.id === m.id ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"}`}>
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1" style={{ minHeight: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseMove={onNodeMouseMove}
          onNodeMouseLeave={onNodeMouseLeave}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Background color="#27272a" gap={20} />
          <Controls className="!bg-zinc-900 !border-zinc-700 !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700" />
          <MiniMap nodeColor={(n) => {
            if (n.type === "root_cause") return "#ef4444";
            if (n.type === "action") return "#10b981";
            if (n.type === "finding") return "#f59e0b";
            return "#3b82f6";
          }} className="!bg-zinc-900 !border-zinc-700" />
        </ReactFlow>

        {/* Tooltip overlay */}
        <NodeTooltip tooltip={tooltip} />
      </div>

      {/* Legend */}
      <div className="border-t border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-red-400 bg-red-400/10" /> Root Cause</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-amber-400 bg-amber-400/10" /> Finding</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-emerald-500 bg-emerald-500/10" /> Action</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-blue-500 bg-blue-500/10" /> Category</span>
          <span className="ml-4 flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-red-500" /> Causal</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 border-t border-dashed border-zinc-500" /> Contributes</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-emerald-500" /> Addresses</span>
        </div>
      </div>

      {/* Side Drawer for node details */}
      <SideDrawer open={selectedNode !== null} onClose={() => setSelectedNode(null)} title={drawerTitle}>
        {drawerContent}
      </SideDrawer>
    </div>
  );
}
