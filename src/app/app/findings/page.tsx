"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTrack } from "@/hooks/useProductTrack";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import ViewSelector, { SavedViewData } from "@/components/console/ViewSelector";
import SaveViewModal from "@/components/console/SaveViewModal";
import FindingDetailPanel from "@/components/console/FindingDetailPanel";
import { loadFindings } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import { useCopilot } from "@/components/app/CopilotProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { FindingProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Findings Page — Wave 3.20 Fase 2
//
// Primary findings view with saved views (ViewSelector),
// groupBy rendering, and persistent filters.
// Replaces /app/analysis as the top-level findings route.
// ──────────────────────────────────────────────

const polarityIcons: Record<string, string> = {
	negative: "!",
	positive: "\u2713",
	neutral: "\u2022",
};

const polarityColors: Record<string, string> = {
	negative: "dark:text-red-400 text-red-600",
	positive: "dark:text-emerald-400 text-emerald-600",
	neutral: "text-content-muted",
};

export default function FindingsPage() {
	const t = useTranslations("console.analysis");
	const tv = useTranslations("console.findings.views");
	const tc = useTranslations("console.common");
	const { track } = useTrack();
	const router = useRouter();
	const searchParams = useSearchParams();
	const copilot = useCopilot();

	// ── Views state ──
	const [views, setViews] = useState<SavedViewData[]>([]);
	const [viewsLoading, setViewsLoading] = useState(true);
	const [activeViewId, setActiveViewId] = useState<string | null>(
		searchParams.get("view") || null,
	);
	const [saveModalOpen, setSaveModalOpen] = useState(false);
	const [savingView, setSavingView] = useState(false);

	// ── Findings data ──
	const mcpData = useMcpData();
	const existingState =
		mcpData.findings.status !== "not_ready" ? mcpData.findings : loadFindings();
	const hasData =
		existingState.status === "ready" && existingState.data.length > 0;
	const findings: FindingProjection[] =
		existingState.status === "ready" ? existingState.data : [];

	// ── Drawer state ──
	const [selectedFinding, setSelectedFinding] =
		useState<FindingProjection | null>(null);

	// ── Fetch views on mount ──
	useEffect(() => {
		async function fetchViews() {
			try {
				const res = await fetch("/api/views");
				if (res.ok) {
					const data = await res.json();
					setViews(data.views || []);
					// If no ?view= param, default to first view
					if (!searchParams.get("view") && data.views?.length > 0) {
						setActiveViewId(data.views[0].id);
					}
				}
			} catch (err) {
				// Silently fallback to no views
			} finally {
				setViewsLoading(false);
			}
		}
		fetchViews();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Active view ──
	const activeView = useMemo(
		() => views.find((v) => v.id === activeViewId) || views[0] || null,
		[views, activeViewId],
	);

	// ── Apply view filters ──
	const filtered = useMemo(() => {
		if (!activeView) return findings;
		const f = activeView.filters as Record<string, any>;

		return findings.filter((item) => {
			if (item.suppression_context?.visibility === "hidden") return false;

			// Severity filter
			if (f.severity && Array.isArray(f.severity)) {
				if (!f.severity.includes(item.severity)) return false;
			}

			// Polarity filter
			if (f.polarity && typeof f.polarity === "string") {
				if (item.polarity !== f.polarity) return false;
			}

			// Pack filter
			if (f.pack && Array.isArray(f.pack)) {
				if (!f.pack.includes(item.pack)) return false;
			}

			// Verification filter
			if (f.verification && Array.isArray(f.verification)) {
				if (!f.verification.includes(item.verification_maturity)) return false;
			}

			// Change filter
			if (f.change && Array.isArray(f.change)) {
				if (!f.change.includes(item.change_class)) return false;
			}

			// Impact filter
			if (f.impact) {
				const mid = item.impact.midpoint;
				if (f.impact === "gt1000" && mid < 1000) return false;
				if (f.impact === "gt5000" && mid < 5000) return false;
				if (f.impact === "gt10000" && mid < 10000) return false;
			}

			// Surface filter
			if (f.surface && item.surface !== f.surface) return false;

			// Root cause filter
			if (f.rootCause && item.root_cause !== f.rootCause) return false;

			return true;
		});
	}, [findings, activeView]);

	// ── Sorted findings ──
	const sorted = useMemo(() => {
		const sortBy = activeView?.sortBy || "impact_desc";
		const arr = [...filtered];

		switch (sortBy) {
			case "impact_desc":
				arr.sort((a, b) => b.impact.midpoint - a.impact.midpoint);
				break;
			case "impact_asc":
				arr.sort((a, b) => a.impact.midpoint - b.impact.midpoint);
				break;
			case "severity_desc":
				const sevOrder: Record<string, number> = {
					critical: 4,
					high: 3,
					medium: 2,
					low: 1,
					none: 0,
				};
				arr.sort(
					(a, b) =>
						(sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0),
				);
				break;
			default:
				arr.sort((a, b) => b.impact.midpoint - a.impact.midpoint);
		}

		return arr;
	}, [filtered, activeView?.sortBy]);

	// ── GroupBy logic ──
	const groups = useMemo(() => {
		if (!activeView?.groupBy) return null;
		const groupKey = activeView.groupBy;

		const map = new Map<string, FindingProjection[]>();
		for (const item of sorted) {
			let key: string;
			switch (groupKey) {
				case "pack":
					key = item.pack || "other";
					break;
				case "severity":
					key = item.severity || "none";
					break;
				case "root_cause":
					key = item.root_cause || "unknown";
					break;
				case "surface":
					key = item.surface || "/";
					break;
				case "workspace":
					key = item.pack || "other";
					break;
				default:
					key = "all";
			}
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(item);
		}

		// Sort groups by combined impact descending
		const entries = Array.from(map.entries()).sort((a, b) => {
			const impactA = a[1].reduce((s, f) => s + f.impact.midpoint, 0);
			const impactB = b[1].reduce((s, f) => s + f.impact.midpoint, 0);
			return impactB - impactA;
		});

		return entries;
	}, [sorted, activeView?.groupBy]);

	// ── View change handler ──
	function handleViewChange(view: SavedViewData) {
		setActiveViewId(view.id);
		// Update URL
		if (typeof window !== "undefined") {
			const url = new URL(window.location.href);
			url.searchParams.set("view", view.id);
			window.history.replaceState({}, "", url.toString());
		}
		track("view_switch", { view_id: view.id, view_name: view.name });
	}

	// ── Save view handler ──
	async function handleSaveView(data: {
		name: string;
		icon: string;
		color: string;
	}) {
		setSavingView(true);
		try {
			const res = await fetch("/api/views", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: data.name,
					icon: data.icon,
					color: data.color,
					filters: activeView?.filters || {},
					groupBy: activeView?.groupBy || null,
					sortBy: activeView?.sortBy || "impact_desc",
				}),
			});
			if (res.ok) {
				const result = await res.json();
				setViews((prev) => [...prev, result.view]);
				setActiveViewId(result.view.id);
				toast.success(tv("save_view") + " ✓");
				setSaveModalOpen(false);
			} else {
				toast.error("Failed to save view");
			}
		} catch {
			toast.error("Failed to save view");
		} finally {
			setSavingView(false);
		}
	}

	// ── Columns ──
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

	const columns: Column<FindingProjection>[] = [
		{
			key: "polarity",
			label: "",
			className: "w-6",
			render: (row) => (
				<span className={`text-xs font-bold ${polarityColors[row.polarity]}`}>
					{polarityIcons[row.polarity]}
				</span>
			),
		},
		{
			key: "title",
			label: tc("columns.finding"),
			className: "min-w-[240px]",
			render: (row) => (
				<div>
					<span
						className={`text-sm ${row.polarity === "positive" ? "text-emerald-600 dark:text-emerald-300" : "text-content-secondary"}`}
					>
						{row.title}
					</span>
					{row.root_cause && (
						<div className="mt-0.5 text-xs text-content-muted">
							{row.root_cause}
						</div>
					)}
				</div>
			),
		},
		{
			key: "severity",
			label: tc("columns.severity"),
			className: "w-24",
			render: (row) =>
				row.polarity === "positive" ? (
					<span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
						{tc("healthy")}
					</span>
				) : (
					<SeverityBadge value={row.severity} />
				),
		},
		{
			key: "verification",
			label: t("filters.verification.label"),
			className: "w-24",
			render: (row) => <VerificationBadge value={row.verification_maturity} />,
		},
		{
			key: "change",
			label: t("filters.change_class.label"),
			className: "w-28",
			render: (row) => <ChangeBadge value={row.change_class} />,
		},
		{
			key: "impact",
			label: tc("columns.est_impact"),
			className: "w-44",
			render: (row) =>
				row.polarity === "positive" ? (
					<span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
						+
						{row.impact.midpoint >= 1000
							? `$${(row.impact.midpoint / 1000).toFixed(1)}k`
							: `$${row.impact.midpoint}`}
						{tc("per_month_short")}
					</span>
				) : (
					<ImpactBadge
						min={row.impact.monthly_range.min}
						max={row.impact.monthly_range.max}
					/>
				),
		},
		{
			key: "pack",
			label: tc("columns.pack"),
			className: "w-20",
			render: (row) => (
				<span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
					{packLabels[row.pack] || row.pack}
				</span>
			),
		},
		{
			key: "discuss",
			label: "",
			className: "w-20",
			render: (row) =>
				row.polarity !== "positive" ? (
					<ShinyButton
						variant="console"
						onClick={(e) => {
							e.stopPropagation();
							copilot.open({
								finding: row,
								prompt: `Discuss this finding: "${row.title}". What's the impact and what should I do about it?`,
							});
						}}
					>
						{t("discuss")}
					</ShinyButton>
				) : null,
		},
	];

	// ── Loading / empty states ──
	if (!hasData) {
		return (
			<div className="p-4 sm:p-6">
				<ConsoleState state={existingState} loadingLabel={t("loading")} emptyLabel={t("empty")}>
					{() => null}
				</ConsoleState>
			</div>
		);
	}

	// ── Summary cards ──
	const negativeFindings = sorted.filter((f) => f.polarity === "negative");
	const positiveFindings = sorted.filter((f) => f.polarity === "positive");
	const totalImpactMid = negativeFindings.reduce(
		(sum, f) => sum + f.impact.midpoint,
		0,
	);

	const summaryCards: SummaryCard[] = [
		{
			label: t("cards.findings"),
			value: t("cards.findings_value", {
				issues: negativeFindings.length,
				strengths: positiveFindings.length,
			}),
		},
		{
			label: t("cards.est_monthly_impact"),
			value:
				totalImpactMid >= 1000
					? `$${(totalImpactMid / 1000).toFixed(1)}k`
					: `$${totalImpactMid}`,
			variant:
				totalImpactMid >= 20000
					? "danger"
					: totalImpactMid >= 5000
						? "warning"
						: "success",
			negative: totalImpactMid > 0,
			subtext: t("cards.per_month_midpoint"),
		},
		{
			label: t("cards.high_impact_issues"),
			value: negativeFindings.filter((f) => f.impact.midpoint >= 10000).length,
			variant: "danger",
			subtext: t("cards.high_impact_threshold"),
		},
		{
			label: t("cards.verified_findings"),
			value: `${sorted.filter((f) => f.verification_maturity === "confirmed").length}/${negativeFindings.length}`,
			variant: "info",
		},
	];

	return (
		<div className="p-4 sm:p-6">
			<PageHeader
				title={tv("page_title") || t("title")}
				tooltip={tc("page_tooltips.analysis")}
			/>

			{/* View Selector */}
			{!viewsLoading && views.length > 0 && (
				<ViewSelector
					views={views}
					activeViewId={activeViewId}
					onViewChange={handleViewChange}
					onSaveView={() => setSaveModalOpen(true)}
				/>
			)}

			{/* Summary Cards */}
			<div className="mb-6">
				<SummaryCards cards={summaryCards} />
			</div>

			{/* Active view info */}
			{activeView && (
				<div className="mb-4 flex items-center justify-between">
					<span className="text-xs text-content-muted">
						{tc("n_of_total", {
							filtered: sorted.length,
							total: findings.length,
						})}
					</span>
				</div>
			)}

			{/* Grouped rendering */}
			{groups ? (
				<GroupedFindings
					groups={groups}
					columns={columns}
					onRowClick={(row) => {
						setSelectedFinding(row);
						track("drawer_open", { entity_type: "finding", entity_id: row.id });
					}}
				/>
			) : (
				<DataTable
					columns={columns}
					data={sorted}
					onRowClick={(row) => {
						setSelectedFinding(row);
						track("drawer_open", { entity_type: "finding", entity_id: row.id });
					}}
					getRowKey={(row) => row.id}
					emptyMessage={t("no_match")}
				/>
			)}

			{/* Finding Drawer */}
			<SideDrawer
				open={selectedFinding !== null}
				onClose={() => setSelectedFinding(null)}
				title={selectedFinding?.title || ""}
			>
				{selectedFinding && (
					<FindingDetailPanel finding={selectedFinding} variant="full" />
				)}
			</SideDrawer>

			{/* Save View Modal */}
			<SaveViewModal
				open={saveModalOpen}
				onClose={() => setSaveModalOpen(false)}
				onSave={handleSaveView}
				loading={savingView}
			/>
		</div>
	);
}

// ──────────────────────────────────────────────
// GroupedFindings — collapsible sections when groupBy is set
// ──────────────────────────────────────────────

function GroupedFindings({
	groups,
	columns,
	onRowClick,
}: {
	groups: [string, FindingProjection[]][];
	columns: Column<FindingProjection>[];
	onRowClick: (row: FindingProjection) => void;
}) {
	const tv = useTranslations("console.findings.views");
	const tc = useTranslations("console.common");
	const [collapsed, setCollapsed] = useState<Set<string>>(() => {
		// Start expanded for top 3, collapsed for rest
		const set = new Set<string>();
		groups.slice(3).forEach(([key]) => set.add(key));
		return set;
	});

	function toggleGroup(key: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	const packLabels: Record<string, string> = {
		scale_readiness: tc("pack_labels.scale_readiness"),
		revenue_integrity: tc("pack_labels.revenue_integrity"),
		chargeback_resilience: tc("pack_labels.chargeback_resilience"),
		saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
	};

	function getGroupLabel(key: string): string {
		return packLabels[key] || key;
	}

	return (
		<div className="space-y-4">
			{groups.map(([key, items]) => {
				const isCollapsed = collapsed.has(key);
				const combinedImpact = items.reduce(
					(s, f) => s + f.impact.midpoint,
					0,
				);
				const impactStr =
					combinedImpact >= 1000
						? `$${(combinedImpact / 1000).toFixed(1)}k`
						: `$${combinedImpact}`;

				return (
					<div
						key={key}
						className="rounded-lg border border-edge bg-surface-card/30"
					>
						{/* Group header */}
						<button
							onClick={() => toggleGroup(key)}
							className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-card-hover"
						>
							<svg
								className={`h-3.5 w-3.5 shrink-0 text-content-muted transition-transform ${isCollapsed ? "" : "rotate-90"}`}
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={2}
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M8.25 4.5l7.5 7.5-7.5 7.5"
								/>
							</svg>
							<span className="text-sm font-semibold text-content">
								{getGroupLabel(key)}
							</span>
							<span className="rounded-full bg-surface-inset px-2 py-0.5 text-xs text-content-muted">
								{items.length}
							</span>
							<span className="ml-auto font-mono text-xs text-content-muted">
								{impactStr}/mo
							</span>
						</button>

						{/* Group content */}
						{!isCollapsed && (
							<div className="border-t border-edge">
								<DataTable
									columns={columns}
									data={items}
									onRowClick={onRowClick}
									getRowKey={(row) => row.id}
									emptyMessage=""
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
