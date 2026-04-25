"use client";

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useCopilot } from "@/components/app/CopilotProvider";
import Link from "next/link";
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	type Node,
	type Edge,
	type NodeTypes,
	Handle,
	Position,
	type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import { loadAllMaps } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";import { ShinyButton } from "@/components/ui/shiny-button";
import { useTranslations } from "next-intl";
import type { MapDefinition, MapNode } from "../../../../../packages/maps";
import type {
	FindingProjection,
	ActionProjection,
} from "../../../../../packages/projections";

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
// AI Insights Layer — joins findings + actions to journey nodes
//
// The matching is deterministic: finding.surface is a semantic path
// descriptor (e.g., "/checkout", "/cart → /checkout", "/ (sitewide)")
// that maps to journey node metadata.path. No LLM involved — pure
// data join. Results are grouped by root cause so the user sees
// "why this step is broken" not just "what signals we found."
// ──────────────────────────────────────────────

interface NodeInsight {
	finding: FindingProjection;
	actions: ActionProjection[];
}

interface NodeInsights {
	items: NodeInsight[];
	highestSeverity: string;
	totalImpact: number;
}

const SEVERITY_RANK: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

function matchInsightsToNodes(
	nodes: MapNode[],
	findings: FindingProjection[],
	actions: ActionProjection[],
): Map<string, NodeInsights> {
	// Build path → nodeId index from journey commercial nodes
	const nodeIdsByPath = new Map<string, string[]>();
	for (const n of nodes) {
		if (n.type !== "journey_commercial") continue;
		const path = (n.metadata.path as string) || "";
		if (!path) continue;
		const normalized = path.replace(/\/$/, "") || "/";
		const arr = nodeIdsByPath.get(normalized) ?? [];
		arr.push(n.id);
		nodeIdsByPath.set(normalized, arr);
	}
	if (nodeIdsByPath.size === 0) return new Map();

	// Build action lookup by root_cause title for O(1) join
	const actionsByRootCause = new Map<string, ActionProjection[]>();
	for (const a of actions) {
		if (!a.root_cause) continue;
		const arr = actionsByRootCause.get(a.root_cause) ?? [];
		arr.push(a);
		actionsByRootCause.set(a.root_cause, arr);
	}

	// Match each finding to journey nodes via surface path
	const result = new Map<string, NodeInsight[]>();

	for (const f of findings) {
		if (f.polarity === "positive") continue;
		const surfacePaths = parseSurfacePaths(f.surface);
		const matchedActions = f.root_cause
			? (actionsByRootCause.get(f.root_cause) ?? [])
			: [];

		for (const sp of surfacePaths) {
			if (sp === "sitewide") {
				for (const nodeIds of nodeIdsByPath.values()) {
					for (const nid of nodeIds) {
						pushInsight(result, nid, { finding: f, actions: matchedActions });
					}
				}
			} else {
				const nodeIds = nodeIdsByPath.get(sp);
				if (nodeIds) {
					for (const nid of nodeIds) {
						pushInsight(result, nid, { finding: f, actions: matchedActions });
					}
				}
			}
		}
	}

	// Aggregate per-node
	const aggregated = new Map<string, NodeInsights>();
	for (const [nodeId, items] of result) {
		// Deduplicate by finding.id
		const seen = new Set<string>();
		const unique = items.filter((it) => {
			if (seen.has(it.finding.id)) return false;
			seen.add(it.finding.id);
			return true;
		});
		// Sort by severity then impact
		unique.sort((a, b) => {
			const sa = SEVERITY_RANK[a.finding.severity] ?? 4;
			const sb = SEVERITY_RANK[b.finding.severity] ?? 4;
			if (sa !== sb) return sa - sb;
			return b.finding.impact.midpoint - a.finding.impact.midpoint;
		});
		const highest = unique[0]?.finding.severity ?? "low";
		const totalImpact = unique.reduce(
			(sum, it) => sum + it.finding.impact.midpoint,
			0,
		);
		aggregated.set(nodeId, {
			items: unique,
			highestSeverity: highest,
			totalImpact,
		});
	}
	return aggregated;
}

function pushInsight(
	map: Map<string, NodeInsight[]>,
	nodeId: string,
	insight: NodeInsight,
): void {
	const arr = map.get(nodeId) ?? [];
	arr.push(insight);
	map.set(nodeId, arr);
}

function parseSurfacePaths(surface: string): string[] {
	if (!surface) return [];
	const trimmed = surface.trim();
	// "/ (sitewide)" or "sitewide"
	if (trimmed.includes("sitewide")) return ["sitewide"];
	// "/cart → /checkout" → ["/cart", "/checkout"]
	if (trimmed.includes("→")) {
		return trimmed
			.split("→")
			.map((s) => s.trim().replace(/\/$/, "") || "/")
			.filter(Boolean);
	}
	// Single path: "/checkout"
	return [trimmed.replace(/\/$/, "") || "/"];
}

// ──────────────────────────────────────────────
// Custom Nodes
// ──────────────────────────────────────────────

function RootCauseNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	return (
		<div
			className={`min-w-[200px] cursor-pointer rounded-lg border-2 px-4 py-3 transition-shadow hover:shadow-lg hover:shadow-red-500/10 ${severityColors[data.severity] || "border-edge bg-surface-inset/50"}`}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			<div className='text-xs font-semibold uppercase tracking-wider text-content-muted'>
				{t("nodeTypes.rootCause")}
			</div>
			<div className='mt-1 text-sm font-medium text-content'>{data.label}</div>
			{data.impact && (
				<div className='mt-1 font-mono text-xs text-red-600 dark:text-red-400'>
					{formatCurrency(data.impact.min)} – {formatCurrency(data.impact.max)}
					{tc("per_month_short")}
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-muted'
			/>
		</div>
	);
}

function FindingNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	return (
		<div
			className={`min-w-[180px] cursor-pointer rounded-md border px-3 py-2 transition-shadow hover:shadow-lg hover:shadow-amber-500/10 ${severityColors[data.severity] || "border-edge bg-surface-inset/50"}`}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			<div className='text-xs text-content-muted'>{t("nodeTypes.finding")}</div>
			<div className='mt-0.5 text-sm text-content-secondary'>{data.label}</div>
			{data.impact && (
				<div className='mt-1 font-mono text-xs text-red-600 dark:text-red-400'>
					{formatCurrency(data.impact.midpoint)}
					{tc("per_month_short")}
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-muted'
			/>
		</div>
	);
}

function ActionNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	return (
		<div className='min-w-[180px] cursor-pointer rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 transition-shadow hover:shadow-lg hover:shadow-emerald-500/10'>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-emerald-500'
			/>
			<div className='text-xs text-emerald-600 dark:text-emerald-400'>
				{t("nodeTypes.action")}
			</div>
			<div className='mt-0.5 text-sm text-content-secondary'>{data.label}</div>
			{data.impact && (
				<div className='mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400'>
					{t("impact_unlocks", {
						amount: formatCurrency(data.impact.midpoint),
					})}
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-emerald-500'
			/>
		</div>
	);
}

function CategoryNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	return (
		<div className='min-w-[160px] rounded-md border border-blue-600/50 bg-blue-500/10 px-4 py-3'>
			<div className='text-sm font-semibold text-blue-600 dark:text-blue-400'>
				{data.label || t("nodeTypes.category")}
			</div>
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-blue-500'
			/>
		</div>
	);
}

// ── User Journey node types ──

const journeyPageTypeStyles: Record<
	string,
	{ border: string; bg: string; text: string; icon: string }
> = {
	homepage: {
		border: "border-emerald-500/50",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		icon: "Homepage",
	},
	landing: {
		border: "border-emerald-500/50",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		icon: "Landing",
	},
	product: {
		border: "border-blue-500/50",
		bg: "bg-blue-500/10",
		text: "text-blue-600 dark:text-blue-400",
		icon: "Product",
	},
	category: {
		border: "border-blue-500/50",
		bg: "bg-blue-500/10",
		text: "text-blue-600 dark:text-blue-400",
		icon: "Category",
	},
	pricing: {
		border: "border-violet-500/50",
		bg: "bg-violet-500/10",
		text: "text-violet-600 dark:text-violet-400",
		icon: "Pricing",
	},
	cart: {
		border: "border-amber-500/50",
		bg: "bg-amber-500/10",
		text: "text-amber-600 dark:text-amber-400",
		icon: "Cart",
	},
	checkout: {
		border: "border-red-500/50",
		bg: "bg-red-500/10",
		text: "text-red-600 dark:text-red-400",
		icon: "Checkout",
	},
	thank_you: {
		border: "border-emerald-500/50",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		icon: "Confirmation",
	},
};

function JourneyCommercialNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const style = journeyPageTypeStyles[data.pageType] || {
		border: "border-edge",
		bg: "bg-surface-inset/50",
		text: "text-content-muted",
		icon: "Page",
	};
	const pageTypeLabel = t(`page_types.${data.pageType || "page"}` as never);
	const conversionRate =
		typeof data.conversionRate === "number" ? data.conversionRate : null;
	const insights: NodeInsights | null = data._insights || null;

	return (
		<div
			className={`relative min-w-[180px] max-w-[220px] rounded-lg border-2 px-4 py-3 ${style.border} ${style.bg}`}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			{/* AI Insights badge — pulsing severity dot in the top-right corner */}
			{insights && insights.items.length > 0 && (
				<InsightBadge insights={insights} />
			)}
			<div
				className={`flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider ${style.text}`}
			>
				<span>{pageTypeLabel}</span>
				{conversionRate !== null && (
					<span className='font-mono text-[11px] tabular-nums'>
						{conversionRate}%
					</span>
				)}
			</div>
			<div
				className='mt-1 truncate text-sm font-medium text-content'
				title={data.label}
			>
				{data.label}
			</div>
			{data.path && (
				<div className='mt-0.5 truncate font-mono text-[10px] text-content-faint'>
					{data.path}
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-muted'
			/>
		</div>
	);
}

const SEVERITY_BADGE_COLORS: Record<string, { dot: string; bg: string; ring: string }> = {
	critical: { dot: "bg-red-500", bg: "bg-red-500/10", ring: "ring-red-500/30" },
	high: { dot: "bg-orange-500", bg: "bg-orange-500/10", ring: "ring-orange-500/30" },
	medium: { dot: "bg-amber-400", bg: "bg-amber-400/10", ring: "ring-amber-400/30" },
	low: { dot: "bg-content-muted", bg: "bg-surface-inset", ring: "ring-content-muted/20" },
};

function InsightBadge({ insights }: { insights: NodeInsights }) {
	const colors = SEVERITY_BADGE_COLORS[insights.highestSeverity] || SEVERITY_BADGE_COLORS.low;
	const count = insights.items.length;
	return (
		<div
			className={`absolute -right-2 -top-2 z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-edge px-1 text-[10px] font-bold tabular-nums text-white shadow-sm ${colors.dot} ring-2 ${colors.ring}`}
			title={`${count} finding${count !== 1 ? "s" : ""} · $${Math.round(insights.totalImpact).toLocaleString()}/mo`}
		>
			<span className='relative'>{count}</span>
			{/* Pulse animation for critical/high */}
			{(insights.highestSeverity === "critical" || insights.highestSeverity === "high") && (
				<span
					className={`absolute inset-0 animate-ping rounded-full opacity-30 ${colors.dot}`}
					style={{ animationDuration: "2s" }}
				/>
			)}
		</div>
	);
}

// Pseudo-nodes (Amplitude-style): "Other events" + "Drop-off" between
// consecutive commercial steps. Rendered with a hatched background to
// communicate "this is aggregate traffic, not a real page" so users
// don't mistake them for regular journey steps.
const HATCH_STYLE: React.CSSProperties = {
	backgroundImage:
		"repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 1px, transparent 6px)",
	backgroundBlendMode: "normal",
	opacity: 0.9,
};

function JourneyOtherEventsNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const rate = typeof data.conversionRate === "number" ? data.conversionRate : null;
	return (
		<div className='relative min-w-[140px] max-w-[180px] overflow-hidden rounded-md border border-dashed border-content-muted/60 bg-surface-card/60 px-3 py-2 text-content-muted'>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 text-content-muted/15'
				style={HATCH_STYLE}
			/>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-faint'
			/>
			<div className='relative text-[10px] font-semibold uppercase tracking-wider text-content-muted'>
				{t("journey.other_events")}
			</div>
			{rate !== null && (
				<div className='relative mt-0.5 font-mono text-xs tabular-nums text-content-secondary'>
					{rate}%
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-faint'
			/>
		</div>
	);
}

function JourneyDropoffNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const rate = typeof data.conversionRate === "number" ? data.conversionRate : null;
	return (
		<div className='relative min-w-[140px] max-w-[180px] overflow-hidden rounded-md border border-dashed border-red-500/40 bg-red-500/5 px-3 py-2 text-red-500'>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 text-red-500/20'
				style={HATCH_STYLE}
			/>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-red-400'
			/>
			<div className='relative text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400'>
				{t("journey.dropoff")}
			</div>
			{rate !== null && (
				<div className='relative mt-0.5 font-mono text-xs tabular-nums text-red-600 dark:text-red-400'>
					{rate}%
				</div>
			)}
		</div>
	);
}

function JourneySupportNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	return (
		<div className='min-w-[160px] max-w-[200px] rounded-md border border-dashed border-edge bg-surface-card/50 px-3 py-2'>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-faint'
			/>
			<div className='text-[10px] font-semibold uppercase tracking-wider text-content-faint'>
				{t(`page_types.${data.pageType || "page"}` as never)}
			</div>
			<div
				className='mt-0.5 truncate text-xs text-content-muted'
				title={data.label}
			>
				{data.label}
			</div>
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-faint'
			/>
		</div>
	);
}

const nodeTypes: NodeTypes = {
	root_cause: RootCauseNode,
	finding: FindingNode,
	action: ActionNode,
	policy: CategoryNode,
	support: CategoryNode,
	trust: CategoryNode,
	measurement: CategoryNode,
	checkout: CategoryNode,
	journey_commercial: JourneyCommercialNode,
	journey_support: JourneySupportNode,
	journey_other_events: JourneyOtherEventsNode,
	journey_dropoff: JourneyDropoffNode,
};

const edgeStyles: Record<string, any> = {
	causal: { stroke: "#ef4444", strokeWidth: 2 },
	contributes_to: {
		stroke: "#71717a",
		strokeWidth: 1.5,
		strokeDasharray: "5 5",
	},
	addresses: { stroke: "#10b981", strokeWidth: 2 },
	transition: { stroke: "#3b82f6", strokeWidth: 1.5 },
	redirect: {
		stroke: "#a78bfa",
		strokeWidth: 1.5,
		strokeDasharray: "2 4",
	},
};

// Legend swatch tokens → Tailwind classes. The engine emits semantic
// tokens (journey_product, root_cause, causal, …) so the legend stays
// aligned with what's actually drawn on the canvas per-map. This is
// the one place where those tokens get translated into CSS.
const NODE_SWATCH_CLASS: Record<string, string> = {
	root_cause: "border-red-400 bg-red-400/10",
	finding: "border-amber-400 bg-amber-400/10",
	action: "border-emerald-500 bg-emerald-500/10",
	category: "border-blue-500 bg-blue-500/10",
	journey_homepage: "border-emerald-500 bg-emerald-500/10",
	journey_product: "border-blue-500 bg-blue-500/10",
	journey_pricing: "border-violet-500 bg-violet-500/10",
	journey_cart: "border-amber-500 bg-amber-500/10",
	journey_checkout: "border-red-500 bg-red-500/10",
	journey_confirmation: "border-emerald-500 bg-emerald-500/10",
	journey_support: "border-dashed border-content-muted bg-surface-inset",
	journey_other_events: "border-dashed border-content-muted bg-surface-card/60",
	journey_dropoff: "border-dashed border-red-500/40 bg-red-500/5",
};

const EDGE_SWATCH_CLASS: Record<string, string> = {
	causal: "bg-red-500",
	addresses: "bg-emerald-500",
	contributes_to: "border-t border-dashed border-content-muted",
	transition: "bg-blue-500",
	redirect: "bg-violet-400 [mask-image:linear-gradient(to_right,black_33%,transparent_33%,transparent_66%,black_66%)]",
};

function toReactFlowNodes(mapDef: MapDefinition): Node[] {
	return mapDef.nodes.map((n, index) => ({
		id: n.id,
		type: n.type,
		position: { x: n.position.x * 1.2, y: n.position.y * 1.6 },
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

function toReactFlowEdges(mapDef: MapDefinition): Edge[] {
	return mapDef.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		label: e.label || undefined,
		type: "default",
		style: edgeStyles[e.type] || edgeStyles.causal,
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
						{formatCurrency(node.impact.midpoint)}
						{tc("per_month_short")}
					</span>
				)}
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Drawer Contents
// ──────────────────────────────────────────────

/** Rich finding drawer — uses full FindingProjection when available (same as /analysis) */
function RichFindingDrawer({
	node,
	finding,
}: {
	node: MapNode;
	finding?: FindingProjection | null;
}) {
	const td = useTranslations("console.finding_drawer");
	const tc = useTranslations("console.common");
	const tm = useTranslations("console.maps");
	const router = useRouter();

	if (!finding) {
		// Fallback for nodes without matching finding projection
		return (
			<div className='space-y-6'>
				<section>
					<div className='mt-2 flex flex-wrap items-center gap-2'>
						{node.severity && <SeverityBadge value={node.severity} />}
						{node.pack && (
							<span className='rounded border border-edge px-2 py-0.5 text-xs text-content-muted'>
								{node.pack}
							</span>
						)}
					</div>
				</section>
				{node.impact && (
					<section>
						<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
							{tm("drawer.impactBreakdown")}
						</h3>
						<div className='flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2'>
							<ImpactBadge min={node.impact.min} max={node.impact.max} />
						</div>
					</section>
				)}
			</div>
		);
	}

	const packLabels: Record<string, string> = {
		scale_readiness: tc("pack_labels.scale_readiness"),
		revenue_integrity: tc("pack_labels.revenue_integrity"),
		chargeback_resilience: tc("pack_labels.chargeback_resilience"),
		saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
	};
	const impactTypeLabels: Record<string, string> = {
		revenue_loss: tc("impact_types.revenue_loss"),
		conversion_loss: tc("impact_types.conversion_loss"),
		chargeback_risk: tc("impact_types.chargeback_risk"),
		traffic_waste: tc("impact_types.traffic_waste"),
		lifetime_value_loss: tc("impact_types.lifetime_value_loss"),
		none: tc("impact_types.none"),
	};

	return (
		<div className='space-y-6'>
			{/* Summary */}
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{td("summary")}
				</h3>
				<p className='text-sm text-content-secondary'>{finding.cause}</p>
				<div className='mt-2 flex flex-wrap items-center gap-2'>
					<SeverityBadge value={finding.severity} />
					<VerificationBadge value={finding.verification_maturity} />
					{finding.change_class && <ChangeBadge value={finding.change_class} />}
					<span className='rounded border border-edge px-2 py-0.5 text-xs text-content-muted'>
						{packLabels[finding.pack] || finding.pack}
					</span>
				</div>
			</section>

			{/* Root Cause */}
			{finding.root_cause && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{td("root_cause")}
					</h3>
					<div className='rounded-md border border-edge bg-surface-card px-4 py-3'>
						<span className='text-sm font-medium text-content-secondary'>
							{finding.root_cause}
						</span>
					</div>
				</section>
			)}

			{/* Impact */}
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{td("impact_breakdown")}
				</h3>
				<div className='space-y-2'>
					<div className='flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2'>
						<span className='text-xs text-content-muted'>
							{td("monthly_range")}
						</span>
						<ImpactBadge
							min={finding.impact.monthly_range.min}
							max={finding.impact.monthly_range.max}
						/>
					</div>
					<div className='flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2'>
						<span className='text-xs text-content-muted'>
							{td("impact_type")}
						</span>
						<span className='text-xs text-content-secondary'>
							{impactTypeLabels[finding.impact.impact_type] ||
								finding.impact.impact_type}
						</span>
					</div>
				</div>
			</section>

			{/* Verification */}
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{td("verification")}
				</h3>
				<VerificationPanel
					maturity={finding.verification_maturity}
					method={finding.verification_method}
					verifiedAt={null}
					expiresAt={null}
					reTriggerReason={null}
					decisionStatus={null}
					onRequestVerification={() =>
						router.push(
							`/app/chat?intent=verify&finding=${encodeURIComponent(finding.id)}`,
						)
					}
				/>
			</section>
			<VerificationSufficiencyWarning
				severity={finding.severity}
				maturity={finding.verification_maturity}
			/>

			{/* Reasoning */}
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{td("reasoning")}
				</h3>
				<p className='text-sm leading-relaxed text-content-muted'>
					{finding.reasoning}
				</p>
			</section>

			{/* Cross-map: View in Journey */}
			{finding.surface && !finding.surface.includes("sitewide") && (
				<Link
					href={`/app/maps/user_journey`}
					className='flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/10 dark:text-blue-400'
				>
					<svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'>
						<path strokeLinecap='round' strokeLinejoin='round' d='M9 6.75V15m0 0l-4.28-1.427a2.25 2.25 0 01-1.534-2.134V6.75A2.25 2.25 0 015.468 4.645l3.53 1.175 5.998-2 4.282 1.427A2.25 2.25 0 0121 7.38v7.115M9 15l6-2m-6 2v4.5m6-6.5v4.5m0-4.5l3.532 1.175A2.25 2.25 0 0121 16.505V19.5' />
					</svg>
					{tm("insights.view_in_journey")}
					<span className='ml-auto font-mono text-[10px] text-content-faint'>
						{finding.surface}
					</span>
				</Link>
			)}
		</div>
	);
}

function ActionDrawerContent({ node }: { node: MapNode }) {
	const t = useTranslations("console.maps");
	const actionType =
		typeof node.metadata.action_type === "string"
			? node.metadata.action_type
			: null;
	const description =
		typeof node.metadata.description === "string"
			? node.metadata.description
			: null;

	return (
		<div className='space-y-6'>
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{t("drawer.actionDetails")}
				</h3>
				<div className='mt-2 flex flex-wrap items-center gap-2'>
					{node.severity && <SeverityBadge value={node.severity} />}
					{actionType && (
						<span className='text-xs text-content-muted'>
							{actionType.replace(/_/g, " ")}
						</span>
					)}
					{!!node.metadata.cross_pack && (
						<span className='inline-flex rounded border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400'>
							{t("drawer.crossPack")}
						</span>
					)}
				</div>
			</section>

			{/* Description — shown if available in metadata */}
			{description && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.description")}
					</h3>
					<p className='text-sm leading-relaxed text-content-muted'>
						{description}
					</p>
				</section>
			)}

			{node.impact && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.impactUnlocked")}
					</h3>
					<div className='space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3'>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.monthlyRange")}
							</span>
							<ImpactBadge min={node.impact.min} max={node.impact.max} />
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.midpoint")}
							</span>
							<ImpactBadge
								min={node.impact.midpoint}
								max={node.impact.midpoint}
								compact
							/>
						</div>
					</div>
				</section>
			)}
		</div>
	);
}

function RootCauseDrawerContent({ node }: { node: MapNode }) {
	const t = useTranslations("console.maps");
	const category =
		typeof node.metadata.category === "string" ? node.metadata.category : null;
	const reasoning =
		typeof node.metadata.reasoning === "string"
			? node.metadata.reasoning
			: null;
	const description =
		typeof node.metadata.description === "string"
			? node.metadata.description
			: null;

	return (
		<div className='space-y-6'>
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{t("drawer.rootCauseDetails")}
				</h3>
				<div className='mt-2 flex flex-wrap items-center gap-2'>
					{node.severity && <SeverityBadge value={node.severity} />}
					{category && (
						<span className='rounded border border-edge px-2 py-0.5 text-xs text-content-muted'>
							{category}
						</span>
					)}
				</div>
			</section>

			{/* Reasoning — shown if available in metadata */}
			{reasoning && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.reasoning")}
					</h3>
					<p className='text-sm leading-relaxed text-content-muted'>
						{reasoning}
					</p>
				</section>
			)}

			{/* Description — shown if available in metadata */}
			{description && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.description")}
					</h3>
					<p className='text-sm leading-relaxed text-content-muted'>
						{description}
					</p>
				</section>
			)}

			{node.impact && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.aggregateImpact")}
					</h3>
					<div className='space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3'>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.monthlyRange")}
							</span>
							<ImpactBadge min={node.impact.min} max={node.impact.max} />
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.midpoint")}
							</span>
							<ImpactBadge
								min={node.impact.midpoint}
								max={node.impact.midpoint}
								compact
							/>
						</div>
					</div>
				</section>
			)}

			{Array.isArray(node.metadata.affected_packs) && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.affectedPacks")}
					</h3>
					<div className='flex flex-wrap gap-2'>
						{(node.metadata.affected_packs as string[]).map((pack) => (
							<span
								key={pack}
								className='rounded border border-edge px-2 py-0.5 text-xs text-content-muted'
							>
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
// Legend — reads the per-map legend declared by the builder so it
// always matches the nodes/edges that are actually on screen.
// ──────────────────────────────────────────────

function MapLegend({ legend }: { legend: MapDefinition["legend"] }) {
	const t = useTranslations("console.maps.legend");

	if (
		(!legend?.nodes || legend.nodes.length === 0) &&
		(!legend?.edges || legend.edges.length === 0)
	) {
		return null;
	}

	return (
		<div className='border-t border-edge px-6 py-3'>
			<div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-content-muted'>
				{legend.nodes.map((entry) => (
					<span key={`n:${entry.swatch}`} className='flex items-center gap-1.5'>
						<span
							className={`inline-block h-3 w-3 rounded border-2 ${
								NODE_SWATCH_CLASS[entry.swatch] ||
								"border-content-muted bg-surface-inset"
							}`}
						/>
						{t(entry.labelKey)}
					</span>
				))}
				{legend.edges.length > 0 && legend.nodes.length > 0 && (
					<span className='hidden h-4 w-px bg-edge sm:block' aria-hidden />
				)}
				{legend.edges.map((entry) => (
					<span key={`e:${entry.swatch}`} className='flex items-center gap-1.5'>
						<span
							className={`inline-block h-0.5 w-4 ${
								EDGE_SWATCH_CLASS[entry.swatch] || "bg-content-muted"
							}`}
						/>
						{t(entry.labelKey)}
					</span>
				))}
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Page — single-map canvas view. Routed at /app/maps/[mapId].
// The mapId comes from the URL; the map itself is either an engine
// map loaded via MCP projections (revenue_leakage / chargeback_risk /
// root_cause) or the User Journey map fetched on-demand from its
// Prisma-backed API route.
// ──────────────────────────────────────────────

const JOURNEY_MAP_ID = "user_journey";

export default function MapCanvasPage() {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	const params = useParams<{ mapId: string }>();
	const mapId = typeof params?.mapId === "string" ? params.mapId : "";

	const mcpData = useMcpData();
	const dataState =
		mcpData.maps.status !== "not_ready" ? mcpData.maps : loadAllMaps();

	if (mapId === JOURNEY_MAP_ID) {
		return (
			<Suspense fallback={<MapLoadingShell label={t("loading")} />}>
				<JourneyCanvasView t={t} tc={tc} />
			</Suspense>
		);
	}

	// Custom maps (IDs prefixed with "custom_")
	if (mapId.startsWith("custom_")) {
		return <CustomMapView mapId={mapId} t={t} tc={tc} />;
	}

	// Engine maps
	return (
		<div className='flex h-full flex-col'>
			<ConsoleState
				state={dataState}
				loadingLabel={t("loading")}
				emptyLabel={t("empty")}
			>
				{(maps) => {
					const found = maps.find((m) => m.id === mapId);
					if (!found) {
						return <MapNotFound backLabel={t("back_to_gallery")} />;
					}
					return <MapCanvasShell mapDef={found} t={t} tc={tc} />;
				}}
			</ConsoleState>
		</div>
	);
}

function CustomMapView({
	mapId,
	t,
	tc,
}: {
	mapId: string;
	t: ReturnType<typeof useTranslations>;
	tc: ReturnType<typeof useTranslations>;
}) {
	const [mapDef, setMapDef] = useState<MapDefinition | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		const dbId = mapId.replace(/^custom_/, "");
		fetch(`/api/maps/custom/${dbId}`)
			.then((r) => r.json())
			.then((data) => {
				if (data?.map) setMapDef(data.map as MapDefinition);
			})
			.catch(() => {})
			.finally(() => setLoaded(true));
	}, [mapId]);

	if (!loaded) {
		return <MapLoadingShell label={t("loading")} />;
	}
	if (!mapDef) {
		return <MapNotFound backLabel={t("back_to_gallery")} />;
	}
	return <MapCanvasShell mapDef={mapDef} t={t} tc={tc} />;
}

// ──────────────────────────────────────────────
// Journey canvas view — flagship map.
// Owns filter state (URL-synced) + refetch lifecycle. Wraps the shared
// canvas shell with the filter bar above the board.
// ──────────────────────────────────────────────

const JOURNEY_STAGES = [
	"any",
	"homepage",
	"landing",
	"category",
	"product",
	"pricing",
	"cart",
	"checkout",
	"thank_you",
] as const;
type JourneyStage = (typeof JOURNEY_STAGES)[number];

const JOURNEY_RANGES = ["7d", "30d", "90d", "all_time"] as const;
type JourneyRange = (typeof JOURNEY_RANGES)[number];

interface JourneyFilters {
	start: JourneyStage;
	end: JourneyStage;
	range: JourneyRange;
}

function pickStage(v: string | null | undefined): JourneyStage {
	return (JOURNEY_STAGES as readonly string[]).includes(v || "")
		? (v as JourneyStage)
		: "any";
}

function pickRange(v: string | null | undefined): JourneyRange {
	return (JOURNEY_RANGES as readonly string[]).includes(v || "")
		? (v as JourneyRange)
		: "30d";
}

function JourneyCanvasView({
	t,
	tc,
}: {
	t: ReturnType<typeof useTranslations>;
	tc: ReturnType<typeof useTranslations>;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const filters: JourneyFilters = useMemo(
		() => ({
			start: pickStage(searchParams?.get("start")),
			end: pickStage(searchParams?.get("end")),
			range: pickRange(searchParams?.get("range")),
		}),
		[searchParams],
	);

	const [journeyMap, setJourneyMap] = useState<MapDefinition | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		setLoaded(false);
		const qs = new URLSearchParams({
			start: filters.start,
			end: filters.end,
			range: filters.range,
		}).toString();
		fetch(`/api/maps/user-journey?${qs}`)
			.then((r) => {
				if (!r.ok) throw new Error(`Journey API ${r.status}`);
				return r.json();
			})
			.then((data) => {
				setJourneyMap(data?.map ? (data.map as MapDefinition) : null);
			})
			.catch((err) => {
				console.error("[JourneyCanvasView]", err);
				setJourneyMap(null);
			})
			.finally(() => setLoaded(true));
	}, [filters.start, filters.end, filters.range]);

	const updateFilter = useCallback(
		(patch: Partial<JourneyFilters>) => {
			const next = { ...filters, ...patch };
			const qs = new URLSearchParams();
			if (next.start !== "any") qs.set("start", next.start);
			if (next.end !== "any") qs.set("end", next.end);
			if (next.range !== "30d") qs.set("range", next.range);
			const suffix = qs.toString();
			router.replace(
				`/app/maps/${JOURNEY_MAP_ID}${suffix ? `?${suffix}` : ""}`,
				{ scroll: false },
			);
		},
		[filters, router],
	);

	const mode =
		(journeyMap?.metadata as Record<string, unknown> | undefined)?.mode;

	return (
		<div className='flex h-full flex-col'>
			<MapCanvasHeader mapDef={journeyMap} t={t} tc={tc} />
			<JourneyFiltersBar filters={filters} onChange={updateFilter} mode={mode} />
			<div className='flex-1'>
				{!loaded ? (
					<MapLoadingShell label={t("loading")} />
				) : !journeyMap ? (
					<JourneyEmptyState onReset={() => updateFilter({ start: "any", end: "any" })} />
				) : (
					<MapsContent mapDef={journeyMap} />
				)}
			</div>
		</div>
	);
}

function JourneyEmptyState({ onReset }: { onReset: () => void }) {
	const t = useTranslations("console.maps");
	return (
		<div className='flex h-full flex-col items-center justify-center gap-3 px-6 text-center'>
			<div className='text-sm font-medium text-content'>{t("journey.empty_title")}</div>
			<div className='max-w-sm text-xs text-content-muted'>
				{t("journey.empty_body")}
			</div>
			<button
				onClick={onReset}
				className='mt-2 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover'
			>
				{t("journey.reset_filters")}
			</button>
		</div>
	);
}

// Shared header extracted out of MapCanvasShell so the journey view
// can render its own filter bar between the header and the canvas.
function MapCanvasHeader({
	mapDef,
	t,
	tc,
}: {
	mapDef: MapDefinition | null;
	t: ReturnType<typeof useTranslations>;
	tc: ReturnType<typeof useTranslations>;
}) {
	return (
		<div className='flex items-center justify-between gap-4 border-b border-edge px-6 py-4'>
			<div className='flex min-w-0 items-center gap-3'>
				<Link
					href='/app/maps'
					className='shrink-0 rounded-md border border-edge p-1.5 text-content-muted transition-colors hover:border-edge-strong hover:text-content-secondary'
					aria-label={t("back_to_gallery")}
				>
					<svg
						className='h-4 w-4'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={2}
						stroke='currentColor'
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='M15.75 19.5L8.25 12l7.5-7.5'
						/>
					</svg>
				</Link>
				<div className='[&>div]:mb-0'>
					<PageHeader
						title={mapDef?.name || t("title")}
						tooltip={
							mapDef
								? (t(`descriptions.${mapDef.type}` as never) as string)
								: (tc("page_tooltips.maps") as string)
						}
					/>
				</div>
			</div>
			{mapDef && (
				<ShinyButton
					variant='console'
					onClick={() =>
						(window.location.href = `/app/chat?context=map:${encodeURIComponent(mapDef.id)}`)
					}
				>
					{t("useAsContext")}
				</ShinyButton>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Journey filters bar — Amplitude-style "Starting / Ending / Users In
// / Time" pills. Each pill opens a lightweight dropdown on click.
// Cohort is locked to "All users" for now (no cohort infra yet); we
// still render the pill so the bar matches the final visual language.
// ──────────────────────────────────────────────

interface PillOption<V extends string> {
	value: V;
	label: string;
	disabled?: boolean;
	hint?: string;
}

function FilterPill<V extends string>({
	prefix,
	connector,
	label,
	value,
	options,
	onChange,
	disabled,
	disabledHint,
}: {
	prefix: string;
	connector?: string;
	label: string;
	value: V;
	options: PillOption<V>[];
	onChange: (v: V) => void;
	disabled?: boolean;
	disabledHint?: string;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			const target = e.target as HTMLElement | null;
			if (ref.current && target && !ref.current.contains(target)) {
				setOpen(false);
			}
		}
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKey);
		};
	}, [open]);

	return (
		<div className='flex items-center gap-2'>
			{connector && (
				<span className='text-xs lowercase text-content-muted'>{connector}</span>
			)}
			<div className='relative' ref={ref}>
				<button
					type='button'
					onClick={() => !disabled && setOpen((x) => !x)}
					disabled={disabled}
					title={disabled ? disabledHint : undefined}
					className={`flex min-w-0 items-start gap-3 rounded-lg border px-3 py-1.5 text-left transition-colors sm:min-w-[140px] ${
						disabled
							? "cursor-not-allowed border-edge/40 bg-surface-inset/30 opacity-70"
							: open
								? "border-blue-500/50 bg-blue-500/5"
								: "border-edge bg-surface-card hover:border-edge-strong hover:bg-surface-card-hover"
					}`}
				>
					<div className='flex flex-col leading-tight'>
						<span className='text-[10px] font-semibold uppercase tracking-wider text-content-muted'>
							{prefix}
						</span>
						<span className='text-sm font-medium text-blue-600 dark:text-blue-400'>
							{label}
						</span>
					</div>
					{!disabled && (
						<svg
							className={`mt-1 h-3 w-3 shrink-0 text-content-muted transition-transform ${open ? "rotate-180" : ""}`}
							fill='none'
							viewBox='0 0 12 12'
						>
							<path
								d='M3 4.5l3 3 3-3'
								stroke='currentColor'
								strokeWidth='1.5'
								strokeLinecap='round'
								strokeLinejoin='round'
							/>
						</svg>
					)}
				</button>
				{open && (
					<div className='absolute left-0 top-full z-50 mt-1 min-w-[200px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-edge bg-surface-card shadow-xl'>
						<div className='max-h-[320px] overflow-auto py-1'>
							{options.map((opt) => (
								<button
									key={opt.value}
									type='button'
									disabled={opt.disabled}
									onClick={() => {
										if (opt.disabled) return;
										onChange(opt.value);
										setOpen(false);
									}}
									className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
										opt.disabled
											? "cursor-not-allowed text-content-faint"
											: opt.value === value
												? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
												: "text-content-secondary hover:bg-surface-card-hover hover:text-content"
									}`}
								>
									<span>{opt.label}</span>
									{opt.hint && (
										<span className='text-[10px] text-content-faint'>
											{opt.hint}
										</span>
									)}
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function JourneyFiltersBar({
	filters,
	onChange,
	mode,
}: {
	filters: JourneyFilters;
	onChange: (patch: Partial<JourneyFilters>) => void;
	mode: unknown;
}) {
	const t = useTranslations("console.maps.journey");
	const tStages = useTranslations("console.maps.page_types");

	const stageOptions: PillOption<JourneyStage>[] = JOURNEY_STAGES.map((s) => ({
		value: s,
		label:
			s === "any"
				? (t("any_page") as string)
				: (tStages(s as never) as string),
	}));
	const rangeOptions: PillOption<JourneyRange>[] = JOURNEY_RANGES.map((r) => ({
		value: r,
		label: t(`ranges.${r}` as never) as string,
	}));
	const cohortOptions: PillOption<"all">[] = [
		{ value: "all", label: t("cohorts.all") as string },
	];

	return (
		<div className='no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-edge bg-surface-card/30 px-4 py-3 sm:flex-wrap sm:gap-3 sm:px-6'>
			<FilterPill
				prefix={t("starting") as string}
				label={
					filters.start === "any"
						? (t("any_page") as string)
						: (tStages(filters.start as never) as string)
				}
				value={filters.start}
				options={stageOptions}
				onChange={(v) => onChange({ start: v })}
			/>
			<FilterPill
				prefix={t("ending") as string}
				connector={t("to") as string}
				label={
					filters.end === "any"
						? (t("any_page") as string)
						: (tStages(filters.end as never) as string)
				}
				value={filters.end}
				options={stageOptions}
				onChange={(v) => onChange({ end: v })}
			/>
			<FilterPill<"all">
				prefix={t("users_in") as string}
				connector={t("for") as string}
				label={t("cohorts.all") as string}
				value='all'
				options={cohortOptions}
				onChange={() => {}}
				disabled
				disabledHint={t("cohorts.coming_soon") as string}
			/>
			<FilterPill
				prefix={t("time") as string}
				connector={t("in") as string}
				label={t(`ranges.${filters.range}` as never) as string}
				value={filters.range}
				options={rangeOptions}
				onChange={(v) => onChange({ range: v })}
			/>
			{mode === "inferred" && (
				<span className='ml-auto flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400'>
					<svg
						className='h-3 w-3'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={2}
						stroke='currentColor'
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z'
						/>
					</svg>
					{t("inferred_notice")}
				</span>
			)}
			{mode === "demo" && (
				<span className='ml-auto flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/5 px-2 py-1 text-[11px] text-violet-600 dark:text-violet-400'>
					{t("demo_notice")}
				</span>
			)}
		</div>
	);
}

function MapLoadingShell({ label }: { label: string }) {
	return (
		<div className='flex h-full items-center justify-center text-sm text-content-muted'>
			{label}
		</div>
	);
}

function MapNotFound({ backLabel }: { backLabel: string }) {
	const t = useTranslations("console.maps");
	return (
		<div className='flex h-full flex-col items-center justify-center gap-3 text-center'>
			<div className='text-sm font-medium text-content'>{t("not_found.title")}</div>
			<div className='max-w-sm text-xs text-content-muted'>
				{t("not_found.body")}
			</div>
			<Link
				href='/app/maps'
				className='mt-2 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover'
			>
				← {backLabel}
			</Link>
		</div>
	);
}

function MapCanvasShell({
	mapDef,
	t,
	tc,
}: {
	mapDef: MapDefinition;
	t: ReturnType<typeof useTranslations>;
	tc: ReturnType<typeof useTranslations>;
}) {
	return (
		<div className='flex h-full flex-col'>
			<MapCanvasHeader mapDef={mapDef} t={t} tc={tc} />
			<MapsContent mapDef={mapDef} />
		</div>
	);
}

// ──────────────────────────────────────────────
// Insights Drawer — shown when a journey node with insights is clicked.
// Findings grouped by root cause, with actions and remediation steps.
// ──────────────────────────────────────────────

function InsightsDrawerContent({
	insights,
	nodeLabel,
}: {
	insights: NodeInsights;
	nodeLabel: string;
}) {
	const t = useTranslations("console.maps.insights");
	const router = useRouter();
	const copilot = useCopilot();

	// Group findings by root cause
	const byRootCause = useMemo(() => {
		const groups = new Map<
			string,
			{ rootCause: string; findings: FindingProjection[]; actions: ActionProjection[] }
		>();
		const ungrouped: { finding: FindingProjection; actions: ActionProjection[] }[] = [];

		for (const item of insights.items) {
			const rc = item.finding.root_cause;
			if (rc) {
				let group = groups.get(rc);
				if (!group) {
					group = { rootCause: rc, findings: [], actions: item.actions };
					groups.set(rc, group);
				}
				group.findings.push(item.finding);
			} else {
				ungrouped.push(item);
			}
		}
		return { grouped: Array.from(groups.values()), ungrouped };
	}, [insights.items]);

	return (
		<div className='space-y-5'>
			{/* Summary stat */}
			<div className='flex items-center gap-3 rounded-lg border border-edge bg-surface-inset px-4 py-3'>
				<div className='text-2xl font-bold tabular-nums text-content'>
					{insights.items.length}
				</div>
				<div className='min-w-0 text-xs text-content-muted'>
					<div className='font-medium text-content-secondary'>
						{t("finding_count", { count: insights.items.length })}
					</div>
					<div className='mt-0.5 font-mono text-red-600 dark:text-red-400'>
						{formatCurrency(insights.totalImpact)}/mo
					</div>
				</div>
			</div>

			{/* Root-cause grouped findings */}
			{byRootCause.grouped.map((group) => (
				<section
					key={group.rootCause}
					className='rounded-lg border border-edge bg-surface-card/50 p-4'
				>
					<div className='mb-3 flex items-start gap-2'>
						<span className='mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-[10px] font-bold text-red-500'>
							!
						</span>
						<div className='min-w-0'>
							<div className='text-xs font-semibold uppercase tracking-wider text-content-muted'>
								{t("root_cause")}
							</div>
							{group.actions[0]?.root_cause_key ? (
								<Link
									href={`/app/maps/root_cause?focus=${encodeURIComponent(`rc_${group.actions[0].root_cause_key}`)}`}
									className='mt-0.5 block text-sm font-medium text-content underline decoration-red-500/30 decoration-1 underline-offset-2 transition-colors hover:text-red-500 hover:decoration-red-500/60'
									title={t("view_in_root_cause_map")}
								>
									{group.rootCause}
									<span className='ml-1 inline-block text-[10px] text-content-faint'>↗</span>
								</Link>
							) : (
								<div className='mt-0.5 text-sm font-medium text-content'>
									{group.rootCause}
								</div>
							)}
						</div>
					</div>

					{/* Findings under this root cause */}
					<div className='space-y-2 border-l-2 border-red-500/20 pl-3'>
						{group.findings.map((f) => (
							<div
								key={f.id}
								className='flex items-start justify-between gap-2'
							>
								<div className='min-w-0'>
									<div className='text-xs text-content-secondary'>
										{f.title}
									</div>
									<div className='mt-0.5 font-mono text-[10px] text-red-600 dark:text-red-400'>
										{formatCurrency(f.impact.midpoint)}/mo
									</div>
								</div>
								<SeverityBadge value={f.severity} />
							</div>
						))}
					</div>

					{/* Top action for this root cause */}
					{group.actions.length > 0 && (
						<div className='mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2'>
							<div className='text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400'>
								{t("recommended_action")}
							</div>
							<div className='mt-0.5 text-xs font-medium text-content'>
								{group.actions[0].title}
							</div>
							{group.actions[0].remediation_steps &&
								group.actions[0].remediation_steps.length > 0 && (
									<ol className='mt-2 list-inside list-decimal space-y-0.5 text-[11px] text-content-muted'>
										{group.actions[0].remediation_steps.slice(0, 3).map((step, i) => (
											<li key={i}>{step}</li>
										))}
									</ol>
								)}
						</div>
					)}
				</section>
			))}

			{/* Ungrouped findings (no root cause) */}
			{byRootCause.ungrouped.length > 0 && (
				<section className='space-y-2'>
					<div className='text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("other_findings")}
					</div>
					{byRootCause.ungrouped.map((item) => (
						<div
							key={item.finding.id}
							className='flex items-start justify-between gap-2 rounded-md border border-edge px-3 py-2'
						>
							<div className='min-w-0'>
								<div className='text-xs text-content-secondary'>
									{item.finding.title}
								</div>
								<div className='mt-0.5 font-mono text-[10px] text-red-600 dark:text-red-400'>
									{formatCurrency(item.finding.impact.midpoint)}/mo
								</div>
							</div>
							<SeverityBadge value={item.finding.severity} />
						</div>
					))}
				</section>
			)}

			{/* Discuss in chat CTA */}
			<button
				type='button'
				onClick={() => {
					const selected = insights.items.map((it) => it.finding);
					if (selected.length === 1) {
						copilot.open({
							finding: selected[0],
							prompt: `Discuss this finding: "${selected[0].title}". What's the impact and what should I do about it?`,
						});
					} else {
						copilot.open({
							prompt: `Analyze these ${selected.length} findings together and identify cross-signal patterns:\n${selected.map((f) => `- ${f.title}`).join("\n")}`,
						});
					}
				}}
				className='flex w-full items-center justify-center gap-2 rounded-lg border border-edge bg-surface-card px-4 py-2.5 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover'
			>
				<svg
					className='h-4 w-4'
					fill='none'
					viewBox='0 0 24 24'
					strokeWidth={2}
					stroke='currentColor'
				>
					<path
						strokeLinecap='round'
						strokeLinejoin='round'
						d='M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z'
					/>
				</svg>
				{t("discuss_in_chat")}
			</button>
		</div>
	);
}

function MapsContent({ mapDef }: { mapDef: MapDefinition }) {
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

	const activeMap = mapDef;

	// Build finding lookup: node ID "finding_{inference_key}" → FindingProjection
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
		if (activeMap.type !== "user_journey") return new Map<string, NodeInsights>();
		const findings =
			mcpData.findings.status === "ready" ? mcpData.findings.data : [];
		const actions =
			mcpData.actions?.status === "ready"
				? (mcpData.actions.data as ActionProjection[])
				: [];
		return matchInsightsToNodes(activeMap.nodes, findings, actions);
	}, [activeMap, mcpData.findings, mcpData.actions]);

	// Auto-focus: when ?focus=<nodeId> is present, auto-open that node's
	// drawer on mount. Used by cross-map links (journey → root cause map,
	// root cause map → journey). Fires once.
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
	const nodes = useMemo(() => {
		const base = toReactFlowNodes(activeMap);
		if (insightsMap.size === 0) return base;
		return base.map((n) => {
			const ins = insightsMap.get(n.id);
			if (!ins) return n;
			return { ...n, data: { ...n.data, _insights: ins } };
		});
	}, [activeMap, insightsMap]);
	const edges = useMemo(() => toReactFlowEdges(activeMap), [activeMap]);

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

			// Drop-off / Other events pseudo-nodes: show insights from the
			// preceding commercial step (the one they dropped off FROM).
			if (
				mapNode.type === "journey_dropoff" ||
				mapNode.type === "journey_other_events"
			) {
				// Find the commercial node that feeds into this pseudo-node
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
		[nodeMap, insightsMap, activeMap.edges, activeMap.nodes],
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
			{/* Keyframes for node entrance animation */}
			<style>{`
        /* Hide connection handle dots but keep them functional for edge routing */
        .react-flow__handle {
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Node entrance: staggered opacity fade only (no transform — conflicts with RF positioning) */
        .map-node-enter {
          animation: mapNodeFade 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes mapNodeFade {
          0%   { opacity: 0; filter: blur(4px); }
          100% { opacity: 1; filter: blur(0); }
        }

        /* Edge drawing: stroke draws in progressively */
        .react-flow__edge path:not([style*="dasharray: 5"]) {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: edgeDraw 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.4s forwards;
        }
        @keyframes edgeDraw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>

			{/* Canvas — ReactFlow requires explicit dimensions on its container.
			   The outer div uses flex-1 + min-h for layout; the inner absolute
			   div gives ReactFlow real width/height values. */}
			<div className='relative flex-1 min-h-[500px]'>
				<div className='absolute inset-0'>
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
					<Background color='var(--color-border-edge, #27272a)' gap={20} />
					<Controls className='!border-edge !bg-surface-card !shadow-lg [&>button:hover]:!bg-surface-card-hover [&>button]:!border-edge [&>button]:!bg-surface-inset [&>button]:!text-content-muted' />
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
				</ReactFlow>
				</div>

				{/* Tooltip overlay */}
				<NodeTooltip tooltip={tooltip} />
			</div>

			{/* Legend — per-map so it actually matches what's drawn */}
			<MapLegend legend={activeMap.legend} />


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
