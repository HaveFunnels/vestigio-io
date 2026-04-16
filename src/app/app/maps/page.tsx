"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { useMcpData } from "@/components/app/McpDataProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type { MapDefinition, MapNode } from "../../../../packages/maps";
import type { FindingProjection } from "../../../../packages/projections";

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
	return (
		<div
			className={`min-w-[180px] max-w-[220px] rounded-lg border-2 px-4 py-3 ${style.border} ${style.bg}`}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			<div
				className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}
			>
				{pageTypeLabel}
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
// Page
// ──────────────────────────────────────────────

export default function MapsPage() {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	const mcpData = useMcpData();
	const dataState =
		mcpData.maps.status !== "not_ready" ? mcpData.maps : loadAllMaps();

	return (
		<div className='flex h-full flex-col'>
			<div className='flex items-center justify-between border-b border-edge px-6 py-4'>
				<div className='[&>div]:mb-0'>
					<PageHeader
						title={t("title")}
						subtitle={t("subtitle")}
						tooltip={tc("page_tooltips.maps")}
					/>
				</div>
				{dataState.status === "ready" && (
					<ShinyButton
						variant="console"
						onClick={() => (window.location.href = "/app/chat?context=maps")}
					>
						{t("useAsContext")}
					</ShinyButton>
				)}
			</div>

			<div className='flex-1'>
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
	const mcpData = useMcpData();
	const [journeyMap, setJourneyMap] = useState<MapDefinition | null>(null);
	const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
	const [tooltip, setTooltip] = useState<TooltipState>({
		visible: false,
		x: 0,
		y: 0,
		node: null,
	});

	// Fetch User Journey map on mount
	useEffect(() => {
		fetch("/api/maps/user-journey")
			.then((r) => r.json())
			.then((data) => {
				if (data.map) setJourneyMap(data.map as MapDefinition);
			})
			.catch(() => {});
	}, []);

	// Combine: User Journey first, then engine maps
	const allMaps = useMemo(() => {
		const result: MapDefinition[] = [];
		if (journeyMap) result.push(journeyMap);
		result.push(...maps);
		return result;
	}, [journeyMap, maps]);

	const [activeMap, setActiveMap] = useState<MapDefinition>(maps[0]);

	// When journey loads, make it the default active
	useEffect(() => {
		if (journeyMap && activeMap === maps[0]) {
			setActiveMap(journeyMap);
		}
	}, [journeyMap]);

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

	const nodes = useMemo(() => toReactFlowNodes(activeMap), [activeMap]);
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
			// Only open drawer for finding, action, or root_cause nodes
			if (
				mapNode.type === "finding" ||
				mapNode.type === "action" ||
				mapNode.type === "root_cause"
			) {
				setSelectedNode(mapNode);
			}
		},
		[nodeMap]
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
	const drawerTitle = selectedNode
		? selectedNode.type === "finding"
			? `${t("nodeTypes.finding")}: ${selectedNode.label}`
			: selectedNode.type === "action"
				? `${t("nodeTypes.action")}: ${selectedNode.label}`
				: selectedNode.type === "root_cause"
					? `${t("nodeTypes.rootCause")}: ${selectedNode.label}`
					: selectedNode.label
		: "";

	const drawerContent = selectedNode ? (
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

	return (
		<div className='flex h-full flex-col'>
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

			{/* Map selector */}
			<div className='border-b border-edge px-6 py-2'>
				<div className='flex gap-2'>
					{allMaps.map((m) => (
						<button
							key={m.id}
							onClick={() => {
								setActiveMap(m);
								setSelectedNode(null);
							}}
							className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${activeMap.id === m.id ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-edge text-content-muted hover:border-edge hover:text-content-secondary"}`}
						>
							{m.name}
						</button>
					))}
				</div>
			</div>

			{/* Canvas */}
			<div className='relative flex-1' style={{ minHeight: 500 }}>
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

				{/* Tooltip overlay */}
				<NodeTooltip tooltip={tooltip} />
			</div>

			{/* Legend */}
			<div className='border-t border-edge px-6 py-3'>
				<div className='flex items-center gap-6 text-xs text-content-muted'>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block h-3 w-3 rounded border-2 border-red-400 bg-red-400/10' />{" "}
						{t("legend.rootCause")}
					</span>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block h-3 w-3 rounded border-2 border-amber-400 bg-amber-400/10' />{" "}
						{t("legend.finding")}
					</span>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block h-3 w-3 rounded border-2 border-emerald-500 bg-emerald-500/10' />{" "}
						{t("legend.action")}
					</span>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block h-3 w-3 rounded border-2 border-blue-500 bg-blue-500/10' />{" "}
						{t("legend.category")}
					</span>
					<span className='ml-4 flex items-center gap-1.5'>
						<span className='inline-block h-0.5 w-4 bg-red-500' />{" "}
						{t("legend.causal")}
					</span>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block h-0.5 w-4 border-t border-dashed border-content-muted' />{" "}
						{t("legend.contributes")}
					</span>
					<span className='flex items-center gap-1.5'>
						<span className='inline-block h-0.5 w-4 bg-emerald-500' />{" "}
						{t("legend.addresses")}
					</span>
				</div>
			</div>

			{/* Side Drawer for node details */}
			<SideDrawer
				open={selectedNode !== null}
				onClose={() => setSelectedNode(null)}
				title={drawerTitle}
			>
				{drawerContent}
			</SideDrawer>
		</div>
	);
}
