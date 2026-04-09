"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import { loadActions, loadChangeReport } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
	ActionProjection,
	ChangeReportProjection,
} from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Actions Page — Phase 1B UX Overhaul
//
// Operational queue with incident/opportunity distinction.
// Tab-based filtering, operational status timelines,
// resolve-path action buttons, and category badges.
// ──────────────────────────────────────────────

type CategoryTab =
	| "all"
	| "incident"
	| "opportunity"
	| "verification"
	| "observation";

const categoryConfig: Record<
	string,
	{ label: string; dotColor: string; badgeStyle: string }
> = {
	incident: {
		label: "Incident",
		dotColor: "bg-red-500",
		badgeStyle:
			"bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
	},
	opportunity: {
		label: "Opportunity",
		dotColor: "bg-emerald-500",
		badgeStyle:
			"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
	},
	verification: {
		label: "Verification",
		dotColor: "bg-blue-500",
		badgeStyle:
			"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
	},
	observation: {
		label: "Observation",
		dotColor: "bg-zinc-500",
		badgeStyle: "bg-zinc-500/10 text-content-muted border-zinc-500/20",
	},
};

const effortConfig: Record<string, { label: string; style: string }> = {
	trivial: {
		label: "Trivial",
		style: "text-emerald-600 dark:text-emerald-400",
	},
	low: { label: "Low", style: "text-blue-600 dark:text-blue-400" },
	medium: { label: "Medium", style: "text-amber-600 dark:text-amber-400" },
	high: { label: "High", style: "text-orange-600 dark:text-orange-400" },
	very_high: { label: "Very High", style: "text-red-600 dark:text-red-400" },
};

const resolveConfig: Record<string, { label: string; style: string }> = {
	fix: {
		label: "Mark Resolved",
		style:
			"bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/20",
	},
	verify: {
		label: "Run Verification",
		style:
			"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20",
	},
	track: {
		label: "Track Progress",
		style:
			"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
	},
	dismiss: {
		label: "Dismiss",
		style:
			"bg-zinc-500/10 text-content-muted border-zinc-500/30 hover:bg-zinc-500/20",
	},
};

// ──────────────────────────────────────────────
// Incident operational timeline steps
// ──────────────────────────────────────────────

const incidentSteps = [
	"opened",
	"acknowledged",
	"mitigated",
	"verified",
	"closed",
];
const opportunitySteps = [
	"identified",
	"sized",
	"accepted",
	"implemented",
	"verified",
	"archived",
];

function formatCurrency(value: number): string {
	if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
	return `$${Math.round(value)}`;
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function ActionsPage() {
	const t = useTranslations("console.actions");
	const tc = useTranslations("console.common");
	const mcpData = useMcpData();
	const dataState =
		mcpData.actions.status !== "not_ready" ? mcpData.actions : loadActions();
	const changeState =
		mcpData.changeReport.status !== "not_ready"
			? mcpData.changeReport
			: loadChangeReport();
	const changeReport = changeState.status === "ready" ? changeState.data : null;

	return (
		<div className='p-6'>
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				tooltip={tc("page_tooltips.actions")}
			/>

			<ConsoleState
				state={dataState}
				loadingLabel={t("loading")}
				emptyLabel={t("empty")}
			>
				{(actions) => (
					<ActionsContent actions={actions} changeReport={changeReport} />
				)}
			</ConsoleState>
		</div>
	);
}

// ──────────────────────────────────────────────
// Content
// ──────────────────────────────────────────────

function ActionsContent({
	actions,
	changeReport,
}: {
	actions: ActionProjection[];
	changeReport: ChangeReportProjection | null;
}) {
	const t = useTranslations("console.actions");
	const router = useRouter();
	const searchParams = useSearchParams();
	const [selected, setSelected] = useState<ActionProjection | null>(null);
	const [activeTab, setActiveTab] = useState<CategoryTab>("all");

	// Deep-link support: when the URL carries `?selected=<key>`, find the
	// matching action and open its drawer. Triggered by the dashboard's
	// OpenCriticalKpi tile (passes inferenceKey) — exact match first,
	// then fuzzy match against the action_key (which often embeds the
	// inferenceKey). Drops the param from the URL after consuming so a
	// browser back-button doesn't re-trigger the open.
	useEffect(() => {
		const key = searchParams?.get("selected");
		if (!key || actions.length === 0) return;
		const match =
			actions.find((a) => a.id === key) ||
			actions.find((a) => a.id.includes(key) || key.includes(a.id));
		if (match) setSelected(match);
		const url = new URL(window.location.href);
		url.searchParams.delete("selected");
		window.history.replaceState({}, "", url.toString());
	}, [searchParams, actions]);
	// Wave 0.6: Track which action is currently being verified so the
	// drawer button shows a spinner instead of relying on a global state.
	const [verifyingId, setVerifyingId] = useState<string | null>(null);

	// Category counts
	const counts = useMemo(() => {
		const c = { incident: 0, opportunity: 0, verification: 0, observation: 0 };
		for (const a of actions) {
			if (a.category in c) c[a.category as keyof typeof c]++;
		}
		return c;
	}, [actions]);

	// Filtered actions based on active tab
	const filtered = useMemo(() => {
		if (activeTab === "all") return actions;
		return actions.filter((a) => a.category === activeTab);
	}, [actions, activeTab]);

	// Total addressable impact
	const totalImpact = useMemo(() => {
		return actions.reduce((sum, a) => sum + (a.impact?.midpoint || 0), 0);
	}, [actions]);

	// Wave 0.6: POST /api/verification/run and refresh server data on success.
	// Used by both "Re-verify" (intent='re_verify') and the post-resolution
	// confirmation CTA (intent='confirm_resolution'). The API returns the
	// updated action projection so we can short-circuit the spinner; the
	// router.refresh() then propagates the change to the rest of the page.
	async function runVerification(
		action: ActionProjection,
		intent: "re_verify" | "confirm_resolution"
	) {
		if (verifyingId) return; // one at a time
		setVerifyingId(action.id);
		const pendingToast = toast.loading(t("drawer.verificationRunning"));
		try {
			const res = await fetch("/api/verification/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action_id: action.id, intent }),
			});
			const json = await res.json().catch(() => ({}));
			toast.dismiss(pendingToast);

			if (!res.ok || !json.ok) {
				toast.error(json.message || t("drawer.verificationFailed"));
				return;
			}

			if (json.skipped) {
				// Policy downgraded / denied — surface the reasoning so the user
				// understands why nothing ran. This is success, not failure.
				toast(json.reasoning || t("drawer.verificationSkipped"), {
					icon: "ℹ️",
				});
				return;
			}

			toast.success(
				intent === "confirm_resolution"
					? t("drawer.confirmationRequested")
					: t("drawer.verificationRequested")
			);

			// Refresh server-rendered data so the drawer shows updated maturity.
			// We don't close the drawer — the user often wants to read the result.
			router.refresh();
		} catch (err) {
			toast.dismiss(pendingToast);
			const message =
				err instanceof Error ? err.message : t("drawer.verificationFailed");
			toast.error(message);
		} finally {
			setVerifyingId(null);
		}
	}

	// Summary cards
	const cards: SummaryCard[] = [
		{
			label: t("cards.activeIncidents"),
			value: counts.incident,
			variant: "warning",
			subtext:
				counts.incident > 0
					? t("cards.requireRemediation")
					: t("cards.noneDetected"),
		},
		{
			label: t("cards.openOpportunities"),
			value: counts.opportunity,
			variant: "success",
			subtext:
				counts.opportunity > 0
					? t("cards.actionableImprovements")
					: t("cards.noneIdentified"),
		},
		{
			label: t("cards.pendingVerifications"),
			value: counts.verification,
			variant: "info",
			subtext:
				counts.verification > 0
					? t("cards.awaitingConfirmation")
					: t("cards.allVerified"),
		},
		{
			label: t("cards.totalAddressableImpact"),
			value:
				totalImpact >= 1000
					? `${formatCurrency(totalImpact)}`
					: `$${totalImpact}`,
			variant: "danger",
			// Negative-number rule: addressable impact = money still on
			// the table = a loss until the actions ship. SummaryCards
			// renders this with a leading minus sign and forced red.
			negative: true,
			subtext: t("cards.perMonthMidpoint"),
		},
	];

	// Tab definitions
	const tabs: {
		key: CategoryTab;
		label: string;
		count?: number;
		dotColor?: string;
	}[] = [
		{ key: "all", label: t("tabs.all") },
		{
			key: "incident",
			label: t("tabs.incidents"),
			count: counts.incident,
			dotColor: "bg-red-500",
		},
		{
			key: "opportunity",
			label: t("tabs.opportunities"),
			count: counts.opportunity,
			dotColor: "bg-emerald-500",
		},
		{
			key: "verification",
			label: t("tabs.verifications"),
			count: counts.verification,
			dotColor: "bg-blue-500",
		},
		{
			key: "observation",
			label: t("tabs.observations"),
			count: counts.observation,
			dotColor: "bg-zinc-500",
		},
	];

	// Table columns
	const columns: Column<ActionProjection>[] = [
		{
			key: "priority",
			label: "#",
			className: "w-12",
			render: (row: ActionProjection, _idx?: number) => {
				const rank = filtered.indexOf(row) + 1;
				return (
					<span className='font-mono text-xs text-content-muted'>{rank}</span>
				);
			},
		},
		{
			key: "title",
			label: t("columns.action"),
			render: (row) => (
				<div>
					<div className='text-sm text-content-secondary'>{row.title}</div>
					{row.root_cause && (
						<div className='mt-0.5 text-xs text-content-muted'>
							{row.root_cause}
						</div>
					)}
				</div>
			),
		},
		{
			key: "category",
			label: t("columns.category"),
			className: "w-28",
			render: (row) => <CategoryBadge category={row.category} />,
		},
		{
			key: "status",
			label: t("columns.status"),
			className: "w-28",
			render: (row) => {
				const status = row.operational_status || row.decision_status;
				if (!status)
					return <span className='text-xs text-content-faint'>--</span>;
				return (
					<span className='inline-flex items-center rounded-full border border-edge px-2 py-0.5 text-xs text-content-secondary'>
						{status.replace(/_/g, " ")}
					</span>
				);
			},
		},
		{
			key: "impact",
			label: t("columns.impact"),
			className: "w-40",
			render: (row) =>
				row.impact ? (
					<ImpactBadge
						min={row.impact.monthly_range.min}
						max={row.impact.monthly_range.max}
					/>
				) : (
					<span className='text-xs text-content-faint'>--</span>
				),
		},
		{
			key: "severity",
			label: t("columns.severity"),
			className: "w-24",
			render: (row) => <SeverityBadge value={row.severity} />,
		},
		{
			key: "effort",
			label: t("columns.effort"),
			className: "w-20",
			render: (row) => {
				if (!row.effort_hint)
					return <span className='text-xs text-content-faint'>--</span>;
				const cfg = effortConfig[row.effort_hint];
				return (
					<span
						className={`text-xs font-medium ${cfg?.style || "text-content-muted"}`}
					>
						{cfg?.label || row.effort_hint}
					</span>
				);
			},
		},
		{
			key: "resolve",
			label: t("columns.nextStep"),
			className: "w-24",
			render: (row) => {
				if (!row.resolve_path)
					return <span className='text-xs text-content-faint'>--</span>;
				const cfg = resolveConfig[row.resolve_path];
				return (
					<button
						onClick={(e) => {
							e.stopPropagation();
							setSelected(row);
						}}
						className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${cfg?.style || ""}`}
					>
						{cfg?.label || row.resolve_path}
					</button>
				);
			},
		},
	];

	return (
		<>
			{/* Summary Cards */}
			<div className='mb-6'>
				<SummaryCards cards={cards} />
			</div>

			{/* Change Summary Banner */}
			<div className='mb-4'>
				<ChangeSummaryBanner report={changeReport} />
			</div>

			{/* Explainer */}
			<div className='mb-4 rounded-lg border border-edge bg-surface-card/50 px-4 py-2.5'>
				<p className='text-xs leading-relaxed text-content-muted'>
					{t("explainer")}
				</p>
			</div>

			{/* Tab Bar */}
			<div className='mb-4 flex items-center gap-1 rounded-lg border border-edge bg-surface-card p-1'>
				{tabs.map((tab) => (
					<button
						key={tab.key}
						onClick={() => setActiveTab(tab.key)}
						className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
							activeTab === tab.key
								? "bg-surface-inset font-semibold text-content"
								: "text-content-muted hover:text-content-secondary"
						}`}
					>
						{tab.dotColor && (
							<span
								className={`inline-block h-2 w-2 rounded-full ${tab.dotColor}`}
							/>
						)}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<span className='rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold text-content-secondary'>
								{tab.count}
							</span>
						)}
					</button>
				))}
			</div>

			{/* Data Table */}
			<DataTable
				columns={columns}
				data={filtered}
				onRowClick={(row) => setSelected(row)}
				getRowKey={(row) => row.id}
			/>

			{/* Side Drawer */}
			<SideDrawer
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected?.title || ""}
			>
				{selected && (
					<ActionDrawerContent
						action={selected}
						onNavigateChat={(id) => router.push(`/chat?action=${id}`)}
						onRunVerification={(intent) => runVerification(selected, intent)}
						isVerifying={verifyingId === selected.id}
					/>
				)}
			</SideDrawer>
		</>
	);
}

// ──────────────────────────────────────────────
// Change Summary Banner — Phase 2 UX
// ──────────────────────────────────────────────

const trendConfig: Record<
	string,
	{ arrow: string; color: string; textColor: string }
> = {
	degrading: {
		arrow: "\u2191",
		color: "border-red-800/50 bg-red-500/5",
		textColor: "text-red-600 dark:text-red-400",
	},
	improving: {
		arrow: "\u2193",
		color: "border-emerald-800/50 bg-emerald-500/5",
		textColor: "text-emerald-600 dark:text-emerald-400",
	},
	stable: {
		arrow: "\u2014",
		color: "border-edge bg-surface-card",
		textColor: "text-content-muted",
	},
	mixed: {
		arrow: "\u2195",
		color: "border-amber-800/50 bg-amber-500/5",
		textColor: "text-amber-600 dark:text-amber-400",
	},
};

function ChangeSummaryBanner({
	report,
}: {
	report: ChangeReportProjection | null;
}) {
	const t = useTranslations("console.actions");
	const [expanded, setExpanded] = useState(false);

	// No change report — first analysis
	if (!report) {
		return (
			<div className='rounded-lg border border-edge bg-surface-card px-4 py-3'>
				<span className='text-sm text-content-muted'>
					{t("changeBanner.firstAnalysis")}
				</span>
			</div>
		);
	}

	const trend = trendConfig[report.overall_trend] || trendConfig.stable;
	const allChanges = [
		...report.regressions,
		...report.improvements,
		...report.new_issues,
		...report.resolved,
	];

	return (
		<div className={`rounded-lg border ${trend.color} transition-all`}>
			{/* Compact header */}
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center justify-between px-4 py-3 text-left'
			>
				<div className='flex items-center gap-3'>
					{/* Trend arrow */}
					<span className={`text-lg font-bold ${trend.textColor}`}>
						{trend.arrow}
					</span>

					{/* Headline text */}
					<span className='text-sm text-content-secondary'>
						{report.headline}
					</span>

					{/* Count pills */}
					<div className='flex items-center gap-2'>
						{report.regression_count > 0 && (
							<span className='rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400'>
								{report.regression_count}{" "}
								{t("changeBanner.regression", {
									count: report.regression_count,
								})}
							</span>
						)}
						{report.improvement_count > 0 && (
							<span className='rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400'>
								{report.improvement_count}{" "}
								{t("changeBanner.improvement", {
									count: report.improvement_count,
								})}
							</span>
						)}
						{report.resolved_count > 0 && (
							<span className='rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400'>
								{report.resolved_count} {t("changeBanner.resolved")}
							</span>
						)}
						{report.new_issue_count > 0 && (
							<span className='rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400'>
								{report.new_issue_count} {t("changeBanner.new")}
							</span>
						)}
					</div>
				</div>

				{/* Chevron */}
				<svg
					className={`h-4 w-4 text-content-muted transition-transform ${expanded ? "rotate-180" : ""}`}
					fill='none'
					viewBox='0 0 24 24'
					stroke='currentColor'
					strokeWidth={2}
				>
					<path
						strokeLinecap='round'
						strokeLinejoin='round'
						d='M19 9l-7 7-7-7'
					/>
				</svg>
			</button>

			{/* Expanded detail: change timeline */}
			{expanded && allChanges.length > 0 && (
				<div className='border-t border-edge px-4 py-4'>
					<ChangeTimeline changes={allChanges} maxItems={10} />
				</div>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Category Badge
// ──────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
	const cfg = categoryConfig[category];
	if (!cfg)
		return <span className='text-xs text-content-muted'>{category}</span>;
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${cfg.badgeStyle}`}
		>
			<span
				className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotColor}`}
			/>
			{cfg.label}
		</span>
	);
}

// ──────────────────────────────────────────────
// Drawer Content
// ──────────────────────────────────────────────

function ActionDrawerContent({
	action,
	onNavigateChat,
	onRunVerification,
	isVerifying,
}: {
	action: ActionProjection;
	onNavigateChat: (id: string) => void;
	onRunVerification: (intent: "re_verify" | "confirm_resolution") => void;
	isVerifying: boolean;
}) {
	const t = useTranslations("console.actions");
	const cfg = categoryConfig[action.category];
	const resolveCfg = action.resolve_path
		? resolveConfig[action.resolve_path]
		: null;

	const [kbLink, setKbLink] = useState<{
		slug: string;
		title: string;
		excerpt?: string;
	} | null>(null);
	useEffect(() => {
		if (!action.root_cause_key) {
			setKbLink(null);
			return;
		}
		fetch(
			`/api/knowledge-base/by-root-cause-key?key=${encodeURIComponent(action.root_cause_key)}`
		)
			.then((r) => r.json())
			.then((data) => {
				if (data.article) setKbLink(data.article);
			})
			.catch(() => {});
	}, [action.root_cause_key]);

	return (
		<div className='space-y-6'>
			{/* Description + Root Cause — visually connected */}
			{(action.description || action.root_cause) && (
				<section>
					<div className='overflow-hidden rounded-md border border-edge bg-surface-card'>
						{action.description && (
							<div className='px-4 py-3'>
								<h3 className='mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-faint'>
									{t("drawer.description")}
								</h3>
								<p className='text-sm leading-relaxed text-content-secondary'>
									{action.description}
								</p>
							</div>
						)}
						{action.description && action.root_cause && (
							<div className='border-t border-edge/50' />
						)}
						{action.root_cause && (
							<div className='px-4 py-3'>
								<h3 className='mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-faint'>
									{t("drawer.rootCause")}
								</h3>
								<span className='text-sm font-medium text-content-secondary'>
									{action.root_cause}
								</span>
							</div>
						)}
					</div>
				</section>
			)}

			{/* Badge Row */}
			<section>
				<div className='flex flex-wrap items-center gap-2'>
					<CategoryBadge category={action.category} />
					<SeverityBadge value={action.severity} />
					<VerificationBadge value={action.verification_maturity} />
					<ChangeBadge value={action.change_class} />
					{action.effort_hint && (
						<span
							className={`inline-flex items-center rounded border border-edge px-2 py-0.5 text-xs font-medium ${effortConfig[action.effort_hint]?.style || "text-content-muted"}`}
						>
							{effortConfig[action.effort_hint]?.label || action.effort_hint}{" "}
							{t("drawer.effort")}
						</span>
					)}
				</div>
			</section>

			{/* Impact Breakdown */}
			{action.impact && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.impactBreakdown")}
					</h3>
					<div className='space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3'>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.monthlyRange")}
							</span>
							<ImpactBadge
								min={action.impact.monthly_range.min}
								max={action.impact.monthly_range.max}
							/>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.midpoint")}
							</span>
							<ImpactBadge
								min={action.impact.midpoint}
								max={action.impact.midpoint}
								compact
							/>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-xs text-content-muted'>
								{t("drawer.priorityScore")}
							</span>
							<span className='font-mono text-xs text-content-secondary'>
								{action.priority_score}
							</span>
						</div>
					</div>
				</section>
			)}

			{/* Operational Status Timeline */}
			{action.operational_status && (
				<section>
					<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
						{t("drawer.operationalStatus")}
					</h3>
					<OperationalTimeline
						category={action.category}
						currentStatus={action.operational_status}
					/>
				</section>
			)}

			{/* Verification Lifecycle Panel */}
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{t("drawer.verification")}
				</h3>
				<VerificationPanel
					maturity={action.verification_maturity}
					method='unknown'
					verifiedAt={null}
					expiresAt={null}
					reTriggerReason={null}
					decisionStatus={action.decision_status}
					onRequestVerification={
						isVerifying ? undefined : () => onRunVerification("re_verify")
					}
					onConfirmResolution={
						isVerifying
							? undefined
							: () => onRunVerification("confirm_resolution")
					}
				/>
				{isVerifying && (
					<p className='mt-2 text-xs text-content-muted'>
						{t("drawer.verificationRunning")}
					</p>
				)}
			</section>

			{/* Verification Sufficiency Warning */}
			<VerificationSufficiencyWarning
				severity={action.severity}
				maturity={action.verification_maturity}
			/>

			{/* Scope */}
			<section>
				<h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted'>
					{t("drawer.scope")}
				</h3>
				<span
					className={`inline-flex rounded border px-2 py-0.5 text-xs ${
						action.cross_pack
							? "border-emerald-800/50 text-emerald-600 dark:text-emerald-400"
							: "border-edge text-content-muted"
					}`}
				>
					{action.cross_pack
						? t("drawer.affectsMultiplePacks")
						: t("drawer.singlePack")}
				</span>
			</section>

			{/* Knowledge Base Link — always render */}
			{action.root_cause_key && (
				<section>
					<a
						href={
							kbLink
								? `/app/knowledge-base/${kbLink.slug}`
								: `/app/knowledge-base?root_cause=${encodeURIComponent(action.root_cause_key)}`
						}
						className='group flex items-start gap-3 rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content-secondary transition-colors hover:border-accent/40 hover:bg-surface-card-hover'
					>
						<div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-inset text-content-faint group-hover:text-accent'>
							<svg
								className='h-4 w-4'
								fill='none'
								viewBox='0 0 24 24'
								strokeWidth={1.5}
								stroke='currentColor'
							>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
								/>
							</svg>
						</div>
						<div className='min-w-0 flex-1'>
							<div className='text-[10px] font-semibold uppercase tracking-wider text-content-faint'>
								{t("drawer.learnMore")}
							</div>
							<div className='mt-0.5 truncate text-sm font-medium text-content'>
								{kbLink ? kbLink.title : t("drawer.browseRelatedDocs")}
							</div>
							<div className='mt-0.5 line-clamp-2 text-xs text-content-muted'>
								{kbLink?.excerpt || t("drawer.docsComingSoon")}
							</div>
						</div>
						<svg
							className='mt-1 h-3.5 w-3.5 shrink-0 text-content-faint group-hover:text-accent'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={2}
							stroke='currentColor'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M8.25 4.5l7.5 7.5-7.5 7.5'
							/>
						</svg>
					</a>
				</section>
			)}

			{/* Action Buttons */}
			<section className='space-y-2'>
				<button
					onClick={() => onNavigateChat(action.id)}
					className='w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400'
				>
					{t("drawer.discussInChat")}
				</button>
				{resolveCfg && (
					<button
						disabled={action.resolve_path === "verify" && isVerifying}
						onClick={() => {
							// Only the "verify" resolve path has a wired backend handler today;
							// fix/track/dismiss are placeholders awaiting their own pipelines.
							if (action.resolve_path === "verify") {
								onRunVerification("re_verify");
							}
						}}
						className={`w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors ${resolveCfg.style} disabled:opacity-50`}
					>
						{action.resolve_path === "verify" && isVerifying
							? t("drawer.verificationRunning")
							: resolveCfg.label}
					</button>
				)}
			</section>
		</div>
	);
}

// ──────────────────────────────────────────────
// Operational Timeline
// ──────────────────────────────────────────────

function OperationalTimeline({
	category,
	currentStatus,
}: {
	category: string;
	currentStatus: string;
}) {
	const steps = category === "incident" ? incidentSteps : opportunitySteps;
	const currentIndex = steps.indexOf(currentStatus);

	return (
		<div className='rounded-md border border-edge bg-surface-card px-4 py-3'>
			<div className='flex items-center gap-1'>
				{steps.map((step, i) => {
					const isPast = i < currentIndex;
					const isCurrent = i === currentIndex;

					return (
						<div key={step} className='flex items-center'>
							{/* Step indicator */}
							<div className='flex flex-col items-center'>
								<div
									className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
										isCurrent
											? category === "incident"
												? "bg-red-500/20 text-red-600 ring-2 ring-red-500/40 dark:text-red-400"
												: "bg-emerald-500/20 text-emerald-600 ring-2 ring-emerald-500/40 dark:text-emerald-400"
											: isPast
												? "bg-surface-inset text-content-secondary"
												: "bg-surface-inset/50 text-content-faint"
									}`}
								>
									{isPast ? "\u2713" : i + 1}
								</div>
								<span
									className={`mt-1.5 text-[10px] leading-tight ${
										isCurrent
											? "font-semibold text-content-secondary"
											: isPast
												? "text-content-muted"
												: "text-content-faint"
									}`}
								>
									{step.replace(/_/g, " ")}
								</span>
							</div>

							{/* Connector line */}
							{i < steps.length - 1 && (
								<div
									className={`mx-1 h-0.5 w-4 ${
										i < currentIndex ? "bg-content-faint" : "bg-surface-inset"
									}`}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
