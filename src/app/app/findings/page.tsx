"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import ColumnSelector, {
	DEFAULT_COLUMNS,
} from "@/components/console/ColumnSelector";
import FindingDetailPanel from "@/components/console/FindingDetailPanel";
import DiscutirPopover from "@/components/console/findings/DiscutirPopover";
import { loadFindings, loadChangeReport } from "@/lib/console-data";
import ChangeSummaryBanner from "@/components/console/ChangeSummaryBanner";
import { useMcpData } from "@/components/app/McpDataProvider";
import { useCopilot } from "@/components/app/CopilotProvider";
import type { FindingProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Findings Page — Wave 3.20 Fase 3
//
// Primary findings view with saved views (ViewSelector),
// groupBy rendering, persistent filters, column selection,
// share toggle and pin-to-sidebar support.
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

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BRL: "R$", EUR: "€" };
function fmtImpact(value: number, currency?: string, fallback?: string): string {
	const sym = CURRENCY_SYMBOLS[currency || fallback || "USD"] || "$";
	if (value >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`;
	return `${sym}${value}`;
}

export default function FindingsPage() {
	const t = useTranslations("console.analysis");
	const tv = useTranslations("console.findings.views");
	const tc = useTranslations("console.common");
	const tp = useTranslations("console.copilot.shared_prompts");
	const td = useTranslations("console.findings.discutir");
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
	const [currentUserId, setCurrentUserId] = useState<string | undefined>();
	const [newViewFilters, setNewViewFilters] = useState<{ filters: Record<string, unknown>; groupBy: string | null } | null>(null);

	// ── Findings data ──
	const mcpData = useMcpData();
	const currency = mcpData.currency;
	const existingState =
		mcpData.findings.status !== "not_ready" ? mcpData.findings : loadFindings();
	const hasData =
		existingState.status === "ready" && existingState.data.length > 0;
	const findings: FindingProjection[] =
		existingState.status === "ready" ? existingState.data : [];
	const changeState =
		mcpData.changeReport.status !== "not_ready"
			? mcpData.changeReport
			: loadChangeReport();
	const changeReport = changeState.status === "ready" ? changeState.data : null;

	// ── Drawer state ──
	const [selectedFinding, setSelectedFinding] =
		useState<FindingProjection | null>(null);

	// "Criar ação" is per-row async; track which row is mid-flight so the
	// popover can show "Criando…" instead of letting the user spam clicks.
	const [creatingActionFor, setCreatingActionFor] = useState<string | null>(null);

	async function handleCreateActionFromFinding(finding: FindingProjection) {
		if (creatingActionFor) return;
		// Block duplicate user-actions on the same finding — the popover
		// disables the option already but a fast double-click could slip
		// through before re-render.
		if ((finding.action_refs?.length ?? 0) > 0) {
			toast(td("alreadyHasAction"), { icon: "ℹ️" });
			return;
		}
		setCreatingActionFor(finding.id);
		try {
			const res = await fetch("/api/actions/from-finding", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					finding_id: finding.id,
					title: finding.title,
					description: finding.cause || finding.effect || null,
					remediation_steps: finding.remediation_steps ?? null,
					estimated_effort_hours: finding.estimated_effort_hours ?? null,
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				toast.error(data.message || td("createError"));
				return;
			}
			toast.success(td("createSuccess"));
			track("user_action_created_from_finding", {
				finding_id: finding.id,
				inference_key: finding.inference_key,
			});
		} catch {
			toast.error(td("createNetworkError"));
		} finally {
			setCreatingActionFor(null);
		}
	}

	function handleVerifyFinding(finding: FindingProjection) {
		router.push(
			`/app/chat?intent=verify&finding=${encodeURIComponent(finding.id)}`,
		);
	}

	function handleUnderstandFinding(finding: FindingProjection) {
		copilot.open({
			finding,
			prompt: tp("discuss_finding", { title: finding.title }),
		});
	}

	// Deep-link support: if /app/findings?finding=<id> is opened (e.g. from
	// an action drawer's linked findings list), auto-open the matching
	// finding's drawer. Runs whenever the findings list or the query param
	// changes so the drawer follows back/forward navigation.
	useEffect(() => {
		const id = searchParams.get("finding");
		if (!id) {
			// Param cleared — close any open drawer to keep URL ↔ UI in sync.
			if (selectedFinding) setSelectedFinding(null);
			return;
		}
		if (selectedFinding?.id === id) return;
		const match = findings.find((f) => f.id === id);
		if (match) setSelectedFinding(match);
	}, [searchParams, findings]); // eslint-disable-line react-hooks/exhaustive-deps

	// Open/close helpers keep the URL in sync with drawer state so deep
	// links work both ways: clicking a row updates ?finding=<id>, closing
	// the drawer strips it. Uses router.replace to avoid polluting history.
	function openFindingDrawer(row: FindingProjection) {
		setSelectedFinding(row);
		track("drawer_open", { entity_type: "finding", entity_id: row.id });
		const url = new URL(window.location.href);
		url.searchParams.set("finding", row.id);
		router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
	}

	function closeFindingDrawer() {
		setSelectedFinding(null);
		const url = new URL(window.location.href);
		if (url.searchParams.has("finding")) {
			url.searchParams.delete("finding");
			const qs = url.searchParams.toString();
			router.replace(qs ? `${url.pathname}?${qs}` : url.pathname, { scroll: false });
		}
	}

	// ── Column save debounce ──
	const columnSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ── Fetch views on mount ──
	useEffect(() => {
		async function fetchViews() {
			try {
				const res = await fetch("/api/views");
				if (res.ok) {
					const data = await res.json();
					setViews(data.views || []);
					if (data.currentUserId) {
						setCurrentUserId(data.currentUserId);
					}
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

	// ── Active columns ──
	const activeColumns = useMemo(() => {
		if (!activeView) return DEFAULT_COLUMNS;
		const f = activeView.filters as Record<string, any>;
		if (f.columns && Array.isArray(f.columns)) {
			return f.columns as string[];
		}
		return DEFAULT_COLUMNS;
	}, [activeView]);

	// ── Column change handler (debounced save) ──
	const handleColumnsChange = useCallback(
		(newColumns: string[]) => {
			if (!activeView) return;

			// Update local state immediately
			const updatedFilters = {
				...((activeView.filters as Record<string, any>) || {}),
				columns: newColumns,
			};
			setViews((prev) =>
				prev.map((v) =>
					v.id === activeView.id
						? { ...v, filters: updatedFilters }
						: v,
				),
			);

			// Debounce API save
			if (columnSaveTimer.current) {
				clearTimeout(columnSaveTimer.current);
			}
			columnSaveTimer.current = setTimeout(async () => {
				try {
					await fetch(`/api/views/${activeView.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ filters: updatedFilters }),
					});
				} catch {
					// silently fail
				}
			}, 500);
		},
		[activeView],
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

			// Change filter — on first cycle changeClass is null for all
			// findings. Treat null as "new_issue" since everything is new.
			if (f.change && Array.isArray(f.change)) {
				const effectiveClass = item.change_class ?? "new_issue";
				if (!f.change.includes(effectiveClass)) return false;
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

	// ── View updated handler (from ViewSelector share/pin/delete) ──
	function handleViewUpdated(updatedView: SavedViewData) {
		if (updatedView.id === "__deleted__") {
			setViews((prev) => prev.filter((v) => v.id !== activeView?.id));
			// Switch to first available view
			const remaining = views.filter((v) => v.id !== activeView?.id);
			if (remaining.length > 0) {
				setActiveViewId(remaining[0].id);
			}
			return;
		}
		setViews((prev) =>
			prev.map((v) => (v.id === updatedView.id ? updatedView : v)),
		);
	}

	// ── Save view handler ──
	async function handleSaveView(data: {
		name: string;
		icon: string;
		color: string;
	}) {
		setSavingView(true);
		try {
			// Use newViewFilters from edit panel if available, otherwise fallback to active view
			const filtersToSave = newViewFilters?.filters || activeView?.filters || {};
			const groupByToSave = newViewFilters?.groupBy ?? activeView?.groupBy ?? null;

			const res = await fetch("/api/views", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: data.name,
					icon: data.icon,
					color: data.color,
					filters: filtersToSave,
					groupBy: groupByToSave,
					sortBy: activeView?.sortBy || "impact_desc",
				}),
			});
			if (res.ok) {
				const result = await res.json();
				setViews((prev) => [...prev, result.view]);
				setActiveViewId(result.view.id);
				toast.success(tv("save_view") + " \u2713");
				setSaveModalOpen(false);
				setNewViewFilters(null);
			} else {
				toast.error("Failed to save view");
			}
		} catch {
			toast.error("Failed to save view");
		} finally {
			setSavingView(false);
		}
	}

	// ── Edit view save handler (from ViewSelector edit panel) ──
	async function handleEditViewSave(
		viewId: string | null,
		data: { filters: Record<string, unknown>; groupBy: string | null },
	) {
		if (viewId) {
			// Editing existing view: merge filters preserving columns
			const existingView = views.find((v) => v.id === viewId);
			const existingFilters = (existingView?.filters as Record<string, any>) || {};
			const mergedFilters = { ...existingFilters, ...data.filters };
			// Remove cleared filter keys
			for (const key of ["severity", "polarity", "pack", "impact", "change"]) {
				if (!(key in data.filters)) delete mergedFilters[key];
			}

			try {
				const res = await fetch(`/api/views/${viewId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ filters: mergedFilters, groupBy: data.groupBy }),
				});
				if (res.ok) {
					const result = await res.json();
					setViews((prev) =>
						prev.map((v) => (v.id === result.view.id ? result.view : v)),
					);
					toast.success(tv("view_saved"));
				} else {
					toast.error(tv("save_error"));
				}
			} catch {
				toast.error(tv("save_error"));
			}
		} else {
			// New view: open the save modal (user picks name/icon/color)
			// but first store the filters in a temp ref to pass when saving
			setNewViewFilters(data);
			setSaveModalOpen(true);
		}
	}

	// ── All possible columns ──
	const packLabels: Record<string, string> = {
		scale_readiness: tc("pack_labels.scale_readiness"),
		revenue_integrity: tc("pack_labels.revenue_integrity"),
		chargeback_resilience: tc("pack_labels.chargeback_resilience"),
		money_moment_exposure: tc("pack_labels.money_moment_exposure"),
		saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
		behavioral_heuristics: tc("pack_labels.behavioral_heuristics"),
		copy_alignment: tc("pack_labels.copy_alignment"),
		content_freshness: tc("pack_labels.content_freshness"),
		payment_health: tc("pack_labels.payment_health"),
		channel_integrity: tc("pack_labels.channel_integrity"),
		discoverability: tc("pack_labels.discoverability"),
		brand_integrity: tc("pack_labels.brand_integrity"),
	};

	const impactTypeLabels: Record<string, string> = {
		revenue_loss: tc("impact_types.revenue_loss"),
		conversion_loss: tc("impact_types.conversion_loss"),
		chargeback_risk: tc("impact_types.chargeback_risk"),
		traffic_waste: tc("impact_types.traffic_waste"),
		lifetime_value_loss: tc("impact_types.lifetime_value_loss"),
		none: tc("impact_types.none"),
	};

	const allColumns: Column<FindingProjection>[] = [
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
						+{fmtImpact(row.impact.midpoint, row.impact.currency, currency)}
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
			key: "surface",
			label: tc("columns.surface"),
			className: "w-28",
			render: (row) => (
				<span className="text-xs text-content-muted">
					{row.surface || "-"}
				</span>
			),
		},
		{
			key: "root_cause",
			label: tc("columns.root_cause"),
			className: "w-32",
			render: (row) => (
				<span className="text-xs text-content-muted">
					{row.root_cause || "-"}
				</span>
			),
		},
		{
			key: "confidence_tier",
			label: tc("columns.confidence_tier"),
			className: "w-24",
			render: (row) => (
				<span className="text-xs text-content-muted">
					{(row as any).confidence_tier || "-"}
				</span>
			),
		},
		{
			key: "first_seen",
			label: tc("columns.first_seen"),
			className: "w-24",
			render: (row) => (
				<span className="text-xs text-content-muted">
					{(row as any).first_seen
						? new Date((row as any).first_seen).toLocaleDateString()
						: "-"}
				</span>
			),
		},
		{
			key: "discuss",
			label: "",
			className: "w-24",
			render: (row) =>
				row.polarity !== "positive" ? (
					<DiscutirPopover
						finding={row}
						onVerify={handleVerifyFinding}
						onUnderstand={handleUnderstandFinding}
						onCreateAction={handleCreateActionFromFinding}
						creating={creatingActionFor === row.id}
					/>
				) : null,
		},
	];

	// ── Filter columns based on activeColumns ──
	const columns = allColumns.filter((col) => {
		// Always include polarity (decorative, not toggleable) and discuss (action)
		if (col.key === "polarity" || col.key === "discuss") return true;
		return activeColumns.includes(col.key);
	});

	// ── Loading / empty states ──
	// Wait for BOTH findings data AND views to load before rendering content.
	// Without this, the page briefly shows unfiltered findings then "jumps"
	// when the active view's filters apply — feels like a double redirect.
	if (!hasData || viewsLoading) {
		return (
			<div className="p-4 sm:p-6">
				<ConsoleState state={viewsLoading ? { status: "loading" } : existingState} loadingLabel={t("loading")} emptyLabel={t("empty")}>
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
			value: fmtImpact(totalImpactMid, negativeFindings[0]?.impact?.currency, currency),
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
			value: negativeFindings.filter((f) => f.impact.midpoint >= 5000).length,
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

			{/* View Selector — always show after loading so the "+" button is accessible */}
			{!viewsLoading && (
				<ViewSelector
					views={views}
					activeViewId={activeViewId}
					onViewChange={handleViewChange}
					onSaveView={() => setSaveModalOpen(true)}
					onViewUpdated={handleViewUpdated}
					onEditViewSave={handleEditViewSave}
					currentUserId={currentUserId}
				/>
			)}

			{/* Summary Cards */}
			<div className="mb-6">
				<SummaryCards cards={summaryCards} />
			</div>

			{/* Change Summary Banner */}
			{changeReport && (
				<div className="mb-4">
					<ChangeSummaryBanner report={changeReport} />
				</div>
			)}

			{/* Active view info + Column selector */}
			{activeView && (
				<div className="mb-4 flex items-center justify-between">
					<span className="text-xs text-content-muted">
						{tc("n_of_total", {
							filtered: sorted.length,
							total: findings.length,
						})}
					</span>
					<ColumnSelector
						activeColumns={activeColumns}
						onColumnsChange={handleColumnsChange}
					/>
				</div>
			)}

			{/* Grouped rendering */}
			{groups ? (
				<GroupedFindings
					groups={groups}
					columns={columns}
					onRowClick={(row) => {
						openFindingDrawer(row);
					}}
				/>
			) : (
				<DataTable
					columns={columns}
					data={sorted}
					onRowClick={(row) => {
						openFindingDrawer(row);
					}}
					getRowKey={(row) => row.id}
					emptyMessage={t("no_match")}
				/>
			)}

			{/* Finding Drawer */}
			<SideDrawer
				open={selectedFinding !== null}
				onClose={closeFindingDrawer}
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
		money_moment_exposure: tc("pack_labels.money_moment_exposure"),
		saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
		behavioral_heuristics: tc("pack_labels.behavioral_heuristics"),
		copy_alignment: tc("pack_labels.copy_alignment"),
		content_freshness: tc("pack_labels.content_freshness"),
		payment_health: tc("pack_labels.payment_health"),
		channel_integrity: tc("pack_labels.channel_integrity"),
		discoverability: tc("pack_labels.discoverability"),
		brand_integrity: tc("pack_labels.brand_integrity"),
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
