"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import SideDrawer from "@/components/console/SideDrawer";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { toReactFlowNodes, toReactFlowEdges } from "./map-converters";
import { matchInsightsToNodes, type NodeInsights } from "./insights-matcher";
import {
	RichFindingDrawer,
	ActionDrawerContent,
	RootCauseDrawerContent,
	InsightsDrawerContent,
} from "./drawers";
import MapLegend from "./MapLegend";
import type { MapDefinition, MapNode } from "../../../packages/maps";
import type {
	FindingProjection,
	ActionProjection,
} from "../../../packages/projections";

// ── useMediaQuery hook ──

function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);
	useEffect(() => {
		const mql = window.matchMedia(query);
		setMatches(mql.matches);
		const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [query]);
	return matches;
}

// ── Tooltip ──

interface TooltipState {
	visible: boolean;
	x: number;
	y: number;
	node: MapNode | null;
}

function NodeTooltip({ tooltip }: { tooltip: TooltipState }) {
	const tc = useTranslations("console.common");
	if (!tooltip.visible || !tooltip.node) return null;
	const { node } = tooltip;

	return (
		<div
			className='pointer-events-none fixed z-[60] rounded-lg border border-edge bg-surface-card px-4 py-3 shadow-xl'
			style={{ left: tooltip.x + 12, top: tooltip.y - 8, maxWidth: 300 }}
		>
			<div className='text-sm font-medium text-content'>{node.label}</div>
			<div className='mt-1.5 flex items-center gap-2'>
				{node.severity && (
					<span
						className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
							node.severity === "critical"
								? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
								: node.severity === "high"
									? "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400"
									: node.severity === "medium"
										? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
										: "border-edge/20 bg-surface-inset text-content-muted"
						}`}
					>
						{node.severity}
					</span>
				)}
				{node.impact && (
					<span className='font-mono text-xs text-content-muted'>
						{formatCurrencyInline(node.impact.midpoint)}
						{tc("per_month_short")}
					</span>
				)}
			</div>
		</div>
	);
}

function formatCurrencyInline(value: number): string {
	if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
	return `$${Math.round(value)}`;
}

// ── Legend filter helpers ──

/** Check if a node type matches the legend filter swatch */
function nodeMatchesFilter(nodeType: string, filter: string): boolean {
	// Node swatches map directly to node types (or journey subtypes)
	if (filter === nodeType) return true;
	// Journey swatches like "journey_homepage" match pageType metadata
	if (filter.startsWith("journey_")) return nodeType.startsWith("journey");
	// Category swatch matches multiple node types
	if (filter === "category") {
		return ["policy", "support", "trust", "measurement", "checkout"].includes(
			nodeType
		);
	}
	return false;
}

/** Check if an edge type matches the legend filter (edge:xxx format) */
function edgeMatchesFilter(edgeType: string, filter: string): boolean {
	if (!filter.startsWith("edge:")) return false;
	const edgeSwatch = filter.replace("edge:", "");
	return edgeType === edgeSwatch;
}

// ── Main MapCanvas ──

export default function MapCanvas({ mapDef }: { mapDef: MapDefinition }) {
	const t = useTranslations("console.maps");
	const mcpData = useMcpData();
	const searchParams = useSearchParams();
	const focusNodeId = searchParams?.get("focus") || null;
	const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
	const [selectedInsights, setSelectedInsights] = useState<{
		label: string;
		insights: NodeInsights;
	} | null>(null);
	const [tooltip, setTooltip] = useState<TooltipState>({
		visible: false,
		x: 0,
		y: 0,
		node: null,
	});
	const [focusHandled, setFocusHandled] = useState(false);
	const [legendFilter, setLegendFilter] = useState<string | null>(null);

	const isMobile = useMediaQuery("(max-width: 768px)");

	const activeMap = mapDef;

	// Build finding lookup: node ID "finding_{inference_key}" -> FindingProjection
	const findingLookup = useMemo(() => {
		const map = new Map<string, FindingProjection>();
		const findingsState =
			mcpData.findings.status === "ready" ? mcpData.findings.data : [];
		for (const f of findingsState) {
			map.set(`finding_${f.inference_key}`, f);
		}
		return map;
	}, [mcpData.findings]);

	// AI Insights: match findings + actions to journey nodes
	const insightsMap = useMemo(() => {
		if (activeMap.type !== "user_journey")
			return new Map<string, NodeInsights>();
		const findings =
			mcpData.findings.status === "ready" ? mcpData.findings.data : [];
		const actions =
			mcpData.actions?.status === "ready"
				? (mcpData.actions.data as ActionProjection[])
				: [];
		return matchInsightsToNodes(activeMap.nodes, findings, actions);
	}, [activeMap, mcpData.findings, mcpData.actions]);

	// Auto-focus: when ?focus=<nodeId> is present, auto-open that node's
	// drawer on mount.
	useEffect(() => {
		if (!focusNodeId || focusHandled) return;
		setFocusHandled(true);
		const mapNode = activeMap.nodes.find((n) => n.id === focusNodeId);
		if (!mapNode) return;
		setTimeout(() => {
			if (
				mapNode.type === "finding" ||
				mapNode.type === "action" ||
				mapNode.type === "root_cause"
			) {
				setSelectedNode(mapNode);
			} else if (mapNode.type === "journey_commercial") {
				const ins = insightsMap.get(mapNode.id);
				if (ins && ins.items.length > 0) {
					setSelectedInsights({ label: mapNode.label, insights: ins });
				}
			}
		}, 600);
	}, [focusNodeId, focusHandled, activeMap.nodes, insightsMap]);

	// Inject insights into ReactFlow node data so JourneyCommercialNode can render badges
	const baseNodes = useMemo(() => {
		const base = toReactFlowNodes(activeMap);
		if (insightsMap.size === 0) return base;
		return base.map((n) => {
			const ins = insightsMap.get(n.id);
			if (!ins) return n;
			return { ...n, data: { ...n.data, _insights: ins } };
		});
	}, [activeMap, insightsMap]);

	// Apply legend filter to nodes (opacity dimming)
	const nodes = useMemo(() => {
		if (!legendFilter) return baseNodes;
		return baseNodes.map((n) => {
			const matches = legendFilter.startsWith("edge:")
				? false // Edge filter: don't highlight nodes specially, just dim non-connected
				: nodeMatchesFilter(n.type || "", legendFilter);
			if (matches) {
				return {
					...n,
					style: {
						...n.style,
						boxShadow: "0 0 0 2px rgba(99, 91, 255, 0.5)",
						borderRadius: "8px",
					},
				};
			}
			return {
				...n,
				style: {
					...n.style,
					opacity: 0.15,
				},
			};
		});
	}, [baseNodes, legendFilter]);

	const baseEdges = useMemo(() => toReactFlowEdges(activeMap), [activeMap]);

	// Apply legend filter to edges
	const edges = useMemo(() => {
		if (!legendFilter) return baseEdges;
		if (legendFilter.startsWith("edge:")) {
			return baseEdges.map((e) => {
				const matches = edgeMatchesFilter(e.type || "", legendFilter);
				return {
					...e,
					style: matches ? e.style : { ...e.style, opacity: 0.15 },
				};
			});
		}
		// Node filter active — dim edges not connected to matching nodes
		return baseEdges.map((e) => ({
			...e,
			style: { ...e.style, opacity: 0.15 },
		}));
	}, [baseEdges, legendFilter]);

	// Build a lookup from node id -> MapNode for click/hover
	const nodeMap = useMemo(() => {
		const map = new Map<string, MapNode>();
		for (const n of activeMap.nodes) map.set(n.id, n);
		return map;
	}, [activeMap]);

	const onNodeClick: NodeMouseHandler = useCallback(
		(_event, node) => {
			const mapNode = nodeMap.get(node.id);
			if (!mapNode) return;

			// Journey commercial nodes: open insights drawer if insights exist
			if (mapNode.type === "journey_commercial") {
				const ins = insightsMap.get(node.id);
				if (ins && ins.items.length > 0) {
					setSelectedInsights({ label: mapNode.label, insights: ins });
					setSelectedNode(null);
				}
				return;
			}

			// Drop-off / Other events pseudo-nodes
			if (
				mapNode.type === "journey_dropoff" ||
				mapNode.type === "journey_other_events"
			) {
				const inEdge = activeMap.edges.find((e) => e.target === node.id);
				if (inEdge) {
					const srcNode = activeMap.nodes.find((n) => n.id === inEdge.source);
					if (srcNode) {
						const ins = insightsMap.get(srcNode.id);
						if (ins && ins.items.length > 0) {
							setSelectedInsights({
								label: srcNode.label,
								insights: ins,
							});
							setSelectedNode(null);
							return;
						}
					}
				}
				return;
			}

			// Engine map nodes: open regular detail drawer
			if (
				mapNode.type === "finding" ||
				mapNode.type === "action" ||
				mapNode.type === "root_cause"
			) {
				setSelectedInsights(null);
				setSelectedNode(mapNode);
			}
		},
		[nodeMap, insightsMap, activeMap.edges, activeMap.nodes]
	);

	const onNodeMouseEnter: NodeMouseHandler = useCallback(
		(event, node) => {
			const mapNode = nodeMap.get(node.id);
			if (!mapNode) return;
			setTooltip({
				visible: true,
				x: event.clientX,
				y: event.clientY,
				node: mapNode,
			});
		},
		[nodeMap]
	);

	const onNodeMouseMove: NodeMouseHandler = useCallback((event) => {
		setTooltip((prev) => ({ ...prev, x: event.clientX, y: event.clientY }));
	}, []);

	const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
		setTooltip({ visible: false, x: 0, y: 0, node: null });
	}, []);

	// Determine drawer title and content based on selected node type
	const drawerTitle = selectedInsights
		? selectedInsights.label
		: selectedNode
			? selectedNode.type === "finding"
				? `${t("nodeTypes.finding")}: ${selectedNode.label}`
				: selectedNode.type === "action"
					? `${t("nodeTypes.action")}: ${selectedNode.label}`
					: selectedNode.type === "root_cause"
						? `${t("nodeTypes.rootCause")}: ${selectedNode.label}`
						: selectedNode.label
			: "";

	const drawerContent = selectedInsights ? (
		<InsightsDrawerContent
			insights={selectedInsights.insights}
			nodeLabel={selectedInsights.label}
		/>
	) : selectedNode ? (
		selectedNode.type === "finding" ? (
			<RichFindingDrawer
				node={selectedNode}
				finding={findingLookup.get(selectedNode.id)}
			/>
		) : selectedNode.type === "action" ? (
			<ActionDrawerContent node={selectedNode} />
		) : selectedNode.type === "root_cause" ? (
			<RootCauseDrawerContent node={selectedNode} />
		) : null
	) : null;

	const drawerOpen = selectedInsights !== null || selectedNode !== null;

	return (
		<div className='flex flex-1 flex-col'>
			{/* Keyframes for critical glow + causal flow animations */}
			<style>{`
        /* Hide connection handle dots but keep them functional for edge routing */
        .react-flow__handle {
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Critical node pulsing glow */
        .map-node-critical-glow {
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
          animation: criticalPulse 2s ease-in-out infinite;
        }
        @keyframes criticalPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.2); }
          50% { box-shadow: 0 0 30px rgba(239, 68, 68, 0.5); }
        }

        /* Causal edge flowing animation */
        @keyframes causal-flow {
          0%   { stroke-dashoffset: 20; }
          100% { stroke-dashoffset: 0; }
        }

        /* Edge drawing: stroke draws in progressively */
        .react-flow__edge path:not([style*="dasharray: 5"]):not([style*="animation"]) {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: edgeDraw 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.4s forwards;
        }
        @keyframes edgeDraw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>

			{/* Canvas */}
			<div className='relative h-full min-h-0 flex-1'>
				<div className='absolute inset-0'>
					<AnimatePresence mode='wait'>
						<motion.div
							key={activeMap.id}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.3 }}
							className='h-full w-full'
						>
							<ReactFlow
								nodes={nodes}
								edges={edges}
								nodeTypes={nodeTypes}
								edgeTypes={edgeTypes}
								fitView
								nodesConnectable={false}
								onNodeClick={onNodeClick}
								onNodeMouseEnter={onNodeMouseEnter}
								onNodeMouseMove={onNodeMouseMove}
								onNodeMouseLeave={onNodeMouseLeave}
								proOptions={{ hideAttribution: true }}
								defaultEdgeOptions={{ type: "default" }}
								panOnDrag={isMobile ? [1, 2] : undefined}
							>
								<Background
									color='var(--color-border-edge, #27272a)'
									gap={20}
								/>
								{isMobile ? (
									<Controls
										showInteractive={false}
										className='!border-edge !bg-surface-card !shadow-lg [&>button:hover]:!bg-surface-card-hover [&>button]:!h-7 [&>button]:!w-7 [&>button]:!border-edge [&>button]:!bg-surface-inset [&>button]:!text-content-muted'
									/>
								) : (
									<Controls className='!border-edge !bg-surface-card !shadow-lg [&>button:hover]:!bg-surface-card-hover [&>button]:!border-edge [&>button]:!bg-surface-inset [&>button]:!text-content-muted' />
								)}
								{!isMobile && (
									<MiniMap
										nodeColor={(n) => {
											if (n.type === "root_cause") return "#ef4444";
											if (n.type === "action") return "#10b981";
											if (n.type === "finding") return "#f59e0b";
											return "#3b82f6";
										}}
										nodeBorderRadius={4}
										maskColor='rgba(0,0,0,0.7)'
										className='!rounded-lg !border-edge !bg-surface-card !p-1'
									/>
								)}
							</ReactFlow>
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Tooltip overlay */}
				<NodeTooltip tooltip={tooltip} />
			</div>

			{/* Legend — per-map so it actually matches what's drawn */}
			<MapLegend
				legend={activeMap.legend}
				onFilterChange={setLegendFilter}
				isMobile={isMobile}
			/>

			{/* Side Drawer for node details + insights */}
			<SideDrawer
				open={drawerOpen}
				onClose={() => {
					setSelectedNode(null);
					setSelectedInsights(null);
				}}
				title={drawerTitle}
			>
				{drawerContent}
			</SideDrawer>
		</div>
	);
}
