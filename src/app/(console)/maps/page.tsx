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
import { ShinyButton } from "@/components/ui/shiny-button";
import { useTranslations } from "next-intl";
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
  low: "border-edge bg-surface-inset/50",
};

// ──────────────────────────────────────────────
// Custom Nodes
// ──────────────────────────────────────────────

function RootCauseNode({ data }: { data: any }) {
  return (
    <div className={`rounded-lg border-2 px-4 py-3 min-w-[200px] cursor-pointer transition-shadow hover:shadow-lg hover:shadow-red-500/10 ${severityColors[data.severity] || "border-edge bg-surface-inset/50"}`}>
      <Handle type="target" position={Position.Left} className="!bg-content-muted" />
      <div className="text-xs font-semibold uppercase tracking-wider text-content-muted">Root Cause</div>
      <div className="mt-1 text-sm font-medium text-content">{data.label}</div>
      {data.impact && <div className="mt-1 text-xs font-mono text-red-600 dark:text-red-400">{formatCurrency(data.impact.min)} – {formatCurrency(data.impact.max)}/mo</div>}
      <Handle type="source" position={Position.Right} className="!bg-content-muted" />
    </div>
  );
}

function FindingNode({ data }: { data: any }) {
  return (
    <div className={`rounded-md border px-3 py-2 min-w-[180px] cursor-pointer transition-shadow hover:shadow-lg hover:shadow-amber-500/10 ${severityColors[data.severity] || "border-edge bg-surface-inset/50"}`}>
      <Handle type="target" position={Position.Left} className="!bg-content-muted" />
      <div className="text-xs text-content-muted">Finding</div>
      <div className="mt-0.5 text-sm text-content-secondary">{data.label}</div>
      {data.impact && <div className="mt-1 text-xs font-mono text-red-600 dark:text-red-400">{formatCurrency(data.impact.midpoint)}/mo</div>}
      <Handle type="source" position={Position.Right} className="!bg-content-muted" />
    </div>
  );
}

function ActionNode({ data }: { data: any }) {
  return (
    <div className="rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 min-w-[180px] cursor-pointer transition-shadow hover:shadow-lg hover:shadow-emerald-500/10">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <div className="text-xs text-emerald-600 dark:text-emerald-400">Action</div>
      <div className="mt-0.5 text-sm text-content-secondary">{data.label}</div>
      {data.impact && <div className="mt-1 text-xs font-mono text-emerald-600 dark:text-emerald-400">unlocks {formatCurrency(data.impact.midpoint)}/mo</div>}
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  );
}

function CategoryNode({ data }: { data: any }) {
  return (
    <div className="rounded-md border border-blue-600/50 bg-blue-500/10 px-4 py-3 min-w-[160px]">
      <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">{data.label}</div>
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
  return mapDef.nodes.map((n, index) => ({
    id: n.id, type: n.type,
    position: { x: n.position.x * 1.2, y: n.position.y * 1.6 },
    data: { label: n.label, severity: n.severity, impact: n.impact, pack: n.pack, ...n.metadata },
    className: "map-node-enter",
    style: { animationDelay: `${index * 0.05}s` },
  }));
}

function toReactFlowEdges(mapDef: MapDefinition): Edge[] {
  return mapDef.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, label: e.label || undefined,
    type: "default",
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
      className="pointer-events-none fixed z-[60] rounded-lg border border-edge bg-surface-card px-4 py-3 shadow-xl"
      style={{ left: tooltip.x + 12, top: tooltip.y - 8, maxWidth: 300 }}
    >
      <div className="text-sm font-medium text-content">{node.label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        {node.severity && (
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
            node.severity === "critical" ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
            : node.severity === "high" ? "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400"
            : node.severity === "medium" ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-edge/20 bg-surface-inset text-content-muted"
          }`}>
            {node.severity}
          </span>
        )}
        {node.impact && (
          <span className="text-xs font-mono text-content-muted">
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
  const t = useTranslations("console.maps");
  const reasoning = typeof node.metadata.reasoning === "string" ? node.metadata.reasoning : null;
  const description = typeof node.metadata.description === "string" ? node.metadata.description : null;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.summary")}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {node.metadata.confidence != null && <span className="text-xs text-content-muted">{t("drawer.confidence", { value: String(node.metadata.confidence) })}</span>}
          {node.pack && <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">{node.pack}</span>}
          {node.metadata.surface != null && <code className="rounded border border-edge px-2 py-0.5 text-xs text-content-faint">{String(node.metadata.surface)}</code>}
        </div>
      </section>

      {/* Reasoning — shown if available in metadata */}
      {reasoning && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.reasoning")}</h3>
          <p className="text-sm leading-relaxed text-content-muted">{reasoning}</p>
        </section>
      )}

      {/* Description — shown if available in metadata */}
      {description && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.description")}</h3>
          <p className="text-sm leading-relaxed text-content-muted">{description}</p>
        </section>
      )}

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.impactBreakdown")}</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">{t("drawer.monthlyRange")}</span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">{t("drawer.midpoint")}</span>
              <ImpactBadge min={node.impact.midpoint} max={node.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ActionDrawerContent({ node }: { node: MapNode }) {
  const t = useTranslations("console.maps");
  const actionType = typeof node.metadata.action_type === "string" ? node.metadata.action_type : null;
  const description = typeof node.metadata.description === "string" ? node.metadata.description : null;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.actionDetails")}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {actionType && (
            <span className="text-xs text-content-muted">{actionType.replace(/_/g, " ")}</span>
          )}
          {!!node.metadata.cross_pack && (
            <span className="inline-flex rounded border border-emerald-800/50 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">{t("drawer.crossPack")}</span>
          )}
        </div>
      </section>

      {/* Description — shown if available in metadata */}
      {description && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.description")}</h3>
          <p className="text-sm leading-relaxed text-content-muted">{description}</p>
        </section>
      )}

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.impactUnlocked")}</h3>
          <div className="space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">{t("drawer.monthlyRange")}</span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">{t("drawer.midpoint")}</span>
              <ImpactBadge min={node.impact.midpoint} max={node.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RootCauseDrawerContent({ node }: { node: MapNode }) {
  const t = useTranslations("console.maps");
  const category = typeof node.metadata.category === "string" ? node.metadata.category : null;
  const reasoning = typeof node.metadata.reasoning === "string" ? node.metadata.reasoning : null;
  const description = typeof node.metadata.description === "string" ? node.metadata.description : null;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.rootCauseDetails")}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.severity && <SeverityBadge value={node.severity} />}
          {node.metadata.confidence != null && <span className="text-xs text-content-muted">{t("drawer.confidence", { value: String(node.metadata.confidence) })}</span>}
          {category && (
            <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">{category}</span>
          )}
        </div>
      </section>

      {/* Reasoning — shown if available in metadata */}
      {reasoning && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.reasoning")}</h3>
          <p className="text-sm leading-relaxed text-content-muted">{reasoning}</p>
        </section>
      )}

      {/* Description — shown if available in metadata */}
      {description && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.description")}</h3>
          <p className="text-sm leading-relaxed text-content-muted">{description}</p>
        </section>
      )}

      {node.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.aggregateImpact")}</h3>
          <div className="space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">{t("drawer.monthlyRange")}</span>
              <ImpactBadge min={node.impact.min} max={node.impact.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">{t("drawer.midpoint")}</span>
              <ImpactBadge min={node.impact.midpoint} max={node.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}

      {Array.isArray(node.metadata.affected_packs) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{t("drawer.affectedPacks")}</h3>
          <div className="flex flex-wrap gap-2">
            {(node.metadata.affected_packs as string[]).map((pack) => (
              <span key={pack} className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
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
  const t = useTranslations("console.maps");
  const mcpData = useMcpData();
  const dataState = mcpData.maps.status !== "not_ready" ? mcpData.maps : loadAllMaps();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
          <p className="mt-1 text-sm text-content-muted">{t("subtitle")}</p>
        </div>
        {dataState.status === "ready" && (
          <ShinyButton onClick={() => window.location.href = "/chat?context=maps"}>
            {t("useAsContext")}
          </ShinyButton>
        )}
      </div>

      <div className="flex-1">
        <ConsoleState
          state={dataState}
          loadingLabel={t("loading")}
          emptyLabel={t("empty")}
        >
          {(maps) => <MapsContent maps={maps} />}
        </ConsoleState>
      </div>
    </div>
  );
}

function MapsContent({ maps }: { maps: MapDefinition[] }) {
  const t = useTranslations("console.maps");
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
    ? selectedNode.type === "finding" ? `${t("nodeTypes.finding")}: ${selectedNode.label}`
    : selectedNode.type === "action" ? `${t("nodeTypes.action")}: ${selectedNode.label}`
    : selectedNode.type === "root_cause" ? `${t("nodeTypes.rootCause")}: ${selectedNode.label}`
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
      {/* Keyframes for node entrance animation */}
      <style>{`
        .map-node-enter {
          opacity: 0;
          animation: mapNodeFadeIn 0.4s ease-out forwards;
        }
        @keyframes mapNodeFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Map selector */}
      <div className="border-b border-edge px-6 py-2">
        <div className="flex gap-2">
          {maps.map((m) => (
            <button key={m.id} onClick={() => { setActiveMap(m); setSelectedNode(null); }}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${activeMap.id === m.id ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-edge text-content-muted hover:border-edge hover:text-content-secondary"}`}>
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1" style={{ minHeight: 500 }}>
        <ReactFlow
          key={activeMap.id}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesConnectable={false}
          edgesReconnectable={false}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseMove={onNodeMouseMove}
          onNodeMouseLeave={onNodeMouseLeave}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "default" }}
        >
          <Background color="var(--color-border-edge, #27272a)" gap={20} />
          <Controls className="!bg-surface-card !border-edge !shadow-lg [&>button]:!bg-surface-inset [&>button]:!border-edge [&>button]:!text-content-muted [&>button:hover]:!bg-surface-card-hover" />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "root_cause") return "#ef4444";
              if (n.type === "action") return "#10b981";
              if (n.type === "finding") return "#f59e0b";
              return "#3b82f6";
            }}
            nodeBorderRadius={4}
            maskColor="rgba(0,0,0,0.7)"
            className="!bg-surface-card !border-edge !rounded-lg !p-1"
          />
        </ReactFlow>

        {/* Tooltip overlay */}
        <NodeTooltip tooltip={tooltip} />
      </div>

      {/* Legend */}
      <div className="border-t border-edge px-6 py-3">
        <div className="flex items-center gap-6 text-xs text-content-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-red-400 bg-red-400/10" /> {t("legend.rootCause")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-amber-400 bg-amber-400/10" /> {t("legend.finding")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-emerald-500 bg-emerald-500/10" /> {t("legend.action")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-blue-500 bg-blue-500/10" /> {t("legend.category")}</span>
          <span className="ml-4 flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-red-500" /> {t("legend.causal")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 border-t border-dashed border-content-muted" /> {t("legend.contributes")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-emerald-500" /> {t("legend.addresses")}</span>
        </div>
      </div>

      {/* Side Drawer for node details */}
      <SideDrawer open={selectedNode !== null} onClose={() => setSelectedNode(null)} title={drawerTitle}>
        {drawerContent}
      </SideDrawer>
    </div>
  );
}
