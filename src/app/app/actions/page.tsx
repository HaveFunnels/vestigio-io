"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTrack } from "@/hooks/useProductTrack";
import { useCopilot } from "@/components/app/CopilotProvider";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import FixWithAiSection from "@/components/console/actions/FixWithAiSection";
import ScatterPlot from "@/components/console/actions/ScatterPlot";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import CustomSelect from "@/components/console/CustomSelect";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import {
	DrawerSection,
	DrawerStatBox,
	DrawerStatRow,
} from "@/components/console/DrawerSection";
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

type PipelineTab = "pipeline" | "mine";

// Persisted UserAction (chat-Verify flow terminal). Shape mirrors
// the JSON returned by /api/actions/user — mapped to camelCase
// locally to match the rest of this file.
interface UserActionRow {
	id: string;
	title: string;
	description: string | null;
	remediation_steps: string[] | null;
	estimated_effort_hours: number | null;
	status: "pending" | "in_progress" | "done" | "dismissed";
	finding_id: string;
	verified_via_conversation_id: string | null;
	verified_at: string | null;
	done_at: string | null;
	notes: string | null;
	baseline_impact_midpoint: number | null;
	baseline_impact_min: number | null;
	baseline_impact_max: number | null;
	baseline_cycle_ref: string | null;
	// Attribution confirmation (PR attribution-loop) — stamped by the
	// post-cycle job when a subsequent cycle confirms the linked
	// finding is resolved. Drives the "Confirmed" drawer state and
	// gates the "Run verification now" CTA.
	verified_resolved_at: string | null;
	verification_cycle_ref: string | null;
	created_at: string;
	updated_at: string;
}

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
		<div className='p-4 sm:p-6'>
			<PageHeader
				title={t("title")}
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
	const { track } = useTrack();
	const router = useRouter();
	const copilot = useCopilot();
	const searchParams = useSearchParams();
	const [selected, setSelected] = useState<ActionProjection | null>(null);
	const [selectedUserAction, setSelectedUserAction] = useState<UserActionRow | null>(null);
	const [activeTab, setActiveTab] = useState<PipelineTab>("pipeline");
	const [userActions, setUserActions] = useState<UserActionRow[]>([]);
	const [mutatingUserActionId, setMutatingUserActionId] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<"list" | "scatter">("list");
	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [severityFilter, setSeverityFilter] = useState<string>("all");
	const [effortFilter, setEffortFilter] = useState<string>("all");

	// Fetch persisted UserActions once on mount. These come from the
	// chat Verify flow (POST /api/actions/from-finding) and aren't
	// part of the MCP projection layer, so we pull them from the DB
	// directly. Silent failure is acceptable — the tab count will
	// just stay at 0 and the existing projected actions keep working.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/actions/user");
				if (!res.ok) return;
				const data = await res.json();
				if (cancelled) return;
				setUserActions(Array.isArray(data.items) ? data.items : []);
			} catch {
				/* silent */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function updateUserActionStatus(
		action: UserActionRow,
		nextStatus: UserActionRow["status"],
	) {
		if (mutatingUserActionId) return;
		setMutatingUserActionId(action.id);
		try {
			const res = await fetch(`/api/actions/user/${action.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: nextStatus }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.message || t("drawer.mine.updateFailed"));
				return;
			}
			const updated = await res.json();
			setUserActions((prev) =>
				prev.map((a) =>
					a.id === action.id
						? {
								...a,
								status: updated.status,
								done_at: updated.done_at,
								updated_at: updated.updated_at,
							}
						: a,
				),
			);
			setSelectedUserAction((prev) =>
				prev && prev.id === action.id
					? {
							...prev,
							status: updated.status,
							done_at: updated.done_at,
							updated_at: updated.updated_at,
						}
					: prev,
			);
			toast.success(t("drawer.mine.updated"));
		} catch {
			toast.error(t("drawer.mine.updateFailed"));
		} finally {
			setMutatingUserActionId(null);
		}
	}

	// "Run verification now" — the credit-gated impatience escape.
	// Marks the UserAction done (if not already) AND triggers an
	// on-demand audit cycle so the attribution job (post-cycle)
	// can stamp `verifiedResolvedAt` within minutes instead of
	// waiting for the next scheduled sweep. The celebration email
	// fires automatically on confirmation.
	async function runVerificationForUserAction(action: UserActionRow) {
		if (mutatingUserActionId) return;
		setMutatingUserActionId(action.id);
		const pendingToast = toast.loading(t("drawer.mine.triggeringCycle"));
		try {
			// Step 1: mark done if it isn't already — the attribution job
			// only scans status='done' rows, so skipping this silently
			// would waste the credit burn.
			if (action.status !== "done") {
				const patchRes = await fetch(`/api/actions/user/${action.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status: "done" }),
				});
				if (!patchRes.ok) {
					const body = await patchRes.json().catch(() => ({}));
					toast.dismiss(pendingToast);
					toast.error(body?.message || t("drawer.mine.updateFailed"));
					return;
				}
				const updated = await patchRes.json();
				setUserActions((prev) =>
					prev.map((a) =>
						a.id === action.id
							? {
									...a,
									status: updated.status,
									done_at: updated.done_at,
									updated_at: updated.updated_at,
								}
							: a,
					),
				);
				setSelectedUserAction((prev) =>
					prev && prev.id === action.id
						? {
								...prev,
								status: updated.status,
								done_at: updated.done_at,
								updated_at: updated.updated_at,
							}
						: prev,
				);
			}

			// Step 2: kick off the verification cycle.
			const cycleRes = await fetch("/api/cycles/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					cycle_type: "verification",
					reason: `user_action:${action.id}`,
				}),
			});
			toast.dismiss(pendingToast);
			if (!cycleRes.ok) {
				const body = await cycleRes.json().catch(() => ({}));
				// Insufficient credits → tell the user how many they need.
				if (body?.error === "insufficient_credits") {
					toast.error(body.message || t("drawer.mine.insufficientCredits"));
					return;
				}
				// Already running → soft-success. The existing cycle will
				// pick up the attribution stamp when it completes.
				if (body?.error === "cycle_already_running") {
					toast.success(
						body.message || t("drawer.mine.cycleAlreadyRunning"),
					);
					return;
				}
				toast.error(body?.message || t("drawer.mine.cycleTriggerFailed"));
				return;
			}
			const json = await cycleRes.json();
			toast.success(
				t("drawer.mine.cycleQueued", {
					credits: json.credits_charged ?? 0,
				}),
			);
		} catch {
			toast.dismiss(pendingToast);
			toast.error(t("drawer.mine.cycleTriggerFailed"));
		} finally {
			setMutatingUserActionId(null);
		}
	}

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

	// Filtered actions based on filter bar (pipeline tab)
	const filtered = useMemo(() => {
		let result = actions;
		if (typeFilter !== "all") result = result.filter(a => a.category === typeFilter);
		if (severityFilter !== "all") result = result.filter(a => a.severity === severityFilter);
		if (effortFilter !== "all") {
			if (effortFilter === "low") result = result.filter(a => a.effort_hint === "trivial" || a.effort_hint === "low");
			else if (effortFilter === "medium") result = result.filter(a => a.effort_hint === "medium");
			else if (effortFilter === "high") result = result.filter(a => a.effort_hint === "high" || a.effort_hint === "very_high");
		}
		return result;
	}, [actions, typeFilter, severityFilter, effortFilter]);

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

	// Fase 2: Impact-focused summary cards
	const quickWinsCount = useMemo(() => {
		return actions.filter(a => (a.effort_hint === "trivial" || a.effort_hint === "low") && (a.impact?.midpoint ?? 0) > 500).length;
	}, [actions]);

	const inProgressCount = useMemo(() => {
		return actions.filter(a =>
			a.operational_status === "accepted" ||
			a.operational_status === "implemented" ||
			a.decision_status === "confirmed"
		).length;
	}, [actions]);

	const capturedValue = useMemo(() => {
		const resolved = actions.filter(a =>
			a.operational_status === "closed" ||
			a.operational_status === "verified" ||
			a.operational_status === "archived" ||
			a.decision_status === "resolved"
		);
		return resolved.reduce((sum, a) => sum + (a.impact?.midpoint || 0), 0);
	}, [actions]);

	const cards: SummaryCard[] = [
		{
			label: t("cards.totalExposure"),
			value:
				totalImpact >= 1000
					? `${formatCurrency(totalImpact)}`
					: `$${totalImpact}`,
			variant: "danger",
			negative: true,
			subtext: t("cards.combinedExposure"),
		},
		{
			label: t("cards.quickWins"),
			value: quickWinsCount,
			variant: "success",
			subtext: t("cards.lowEffortHighImpact"),
		},
		{
			label: t("cards.inProgress"),
			value: inProgressCount,
			variant: "info",
			subtext: t("cards.activelyWorking"),
		},
		{
			label: t("cards.captured"),
			value:
				capturedValue >= 1000
					? `${formatCurrency(capturedValue)}`
					: `$${capturedValue}`,
			variant: "success",
			subtext: t("cards.resolvedOrVerified"),
		},
	];

	// Tab definitions — Fase 3: 2 tabs + filter bar
	const tabs: {
		key: PipelineTab;
		label: string;
		count?: number;
		dotColor?: string;
	}[] = [
		{
			key: "pipeline",
			label: t("tabs.pipeline"),
			count: actions.length,
		},
		{
			key: "mine",
			label: t("tabs.mine"),
			count: userActions.filter(
				(a) => a.status === "pending" || a.status === "in_progress",
			).length,
			dotColor: "bg-amber-500",
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
			className: "min-w-[240px]",
			render: (row) => (
				<div>
					<div className='text-sm text-content-secondary'>{row.title}</div>
					{row.uplift_hypothesis && (
						<div className='mt-0.5 text-xs text-emerald-500/80 line-clamp-1'>
							{row.uplift_hypothesis}
						</div>
					)}
					{!row.uplift_hypothesis && row.root_cause && (
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
			render: (row) => (
				<div className="flex items-center gap-1.5">
					<CategoryBadge category={row.category} />
					{row.category === 'opportunity' && row.impact?.midpoint && (
						<span className="text-[10px] font-mono text-emerald-400">
							+{formatCurrency(row.impact.midpoint)}
						</span>
					)}
				</div>
			),
		},
		{
			key: "status",
			label: t("columns.status"),
			className: "w-28",
			render: (row) => {
				const status = row.operational_status || row.decision_status;
				if (!status)
					return <span className='text-xs text-content-faint'>--</span>;
				const label = status.replace(/_/g, " ");
				const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
				return (
					<span className='inline-flex items-center rounded-full border border-edge px-2 py-0.5 text-xs text-content-secondary'>
						{capitalized}
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

			{/* Change Summary Banner — only shown when there are actual changes */}
			{changeReport && (changeReport.regression_count > 0 || changeReport.improvement_count > 0 || changeReport.new_issue_count > 0 || changeReport.resolved_count > 0) && (
				<div className='mb-4'>
					<ChangeSummaryBanner report={changeReport} />
				</div>
			)}

			{/* Tab Bar */}
			<div className='mb-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-edge bg-surface-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
				{tabs.map((tab) => (
					<button
						key={tab.key}
						onClick={() => setActiveTab(tab.key)}
						className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
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

			{/* Fase 3: Filter bar — only visible on pipeline tab */}
			{activeTab === "pipeline" && (
				<div className="flex flex-wrap items-center gap-2 mt-3 mb-4">
					<CustomSelect size="sm" value={typeFilter} onChange={setTypeFilter} options={[
						{ value: "all", label: t("filters.type_all") },
						{ value: "incident", label: t("filters.incidents") },
						{ value: "opportunity", label: t("filters.opportunities") },
						{ value: "verification", label: t("filters.verifications") },
						{ value: "observation", label: t("filters.observations") },
					]} />
					<CustomSelect size="sm" value={severityFilter} onChange={setSeverityFilter} options={[
						{ value: "all", label: t("filters.severity_all") },
						{ value: "critical", label: "Critical" },
						{ value: "high", label: "High" },
						{ value: "medium", label: "Medium" },
						{ value: "low", label: "Low" },
					]} />
					<CustomSelect size="sm" value={effortFilter} onChange={setEffortFilter} options={[
						{ value: "all", label: t("filters.effort_all") },
						{ value: "low", label: t("filters.effort_low") },
						{ value: "medium", label: t("filters.effort_medium") },
						{ value: "high", label: t("filters.effort_high") },
					]} />

					{/* View toggle: list / scatter */}
					<div className="ml-auto flex rounded-lg border border-edge overflow-hidden">
						<button
							type="button"
							onClick={() => setViewMode("list")}
							className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-surface-card-hover text-content" : "text-content-faint hover:text-content-secondary"}`}
						>
							{t("scatter.toggle_list")}
						</button>
						<button
							type="button"
							onClick={() => setViewMode("scatter")}
							className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "scatter" ? "bg-surface-card-hover text-content" : "text-content-faint hover:text-content-secondary"}`}
						>
							{t("scatter.toggle_scatter")}
						</button>
					</div>
				</div>
			)}

			{/* Data Table — dispatches on active tab. The "mine" tab
			    renders a distinct table shape for UserActions (chat
			    Verify outcomes) since those carry lifecycle state and
			    baseline impact rather than operational_status/resolve
			    fields. Every other tab filters the MCP projections. */}
			{activeTab === "mine" ? (
				<UserActionsTable
					actions={userActions}
					onRowClick={(row) => setSelectedUserAction(row)}
				/>
			) : viewMode === "scatter" ? (
				<ScatterPlot
					actions={filtered}
					onSelect={(row) => { setSelected(row); track("drawer_open", { entity_type: "action", entity_id: row.id }); }}
				/>
			) : (
				<DataTable
					columns={columns}
					data={filtered}
					onRowClick={(row) => { setSelected(row); track("drawer_open", { entity_type: "action", entity_id: row.id }); }}
					getRowKey={(row) => row.id}
				/>
			)}

			{/* Side Drawer — projected action */}
			<SideDrawer
				open={selected !== null}
				onClose={() => setSelected(null)}
				title={selected?.title || ""}
			>
				{selected && (
					<ActionDrawerContent
						action={selected}
						onNavigateChat={(id) => copilot.open({ prompt: `Discuss action ${id}. What should I prioritize and how do I fix it?` })}
						onRunVerification={(intent) => runVerification(selected, intent)}
						isVerifying={verifyingId === selected.id}
					/>
				)}
			</SideDrawer>

			{/* Side Drawer — user-verified action */}
			<SideDrawer
				open={selectedUserAction !== null}
				onClose={() => setSelectedUserAction(null)}
				title={selectedUserAction?.title || ""}
			>
				{selectedUserAction && (
					<UserActionDrawerContent
						action={selectedUserAction}
						mutating={mutatingUserActionId === selectedUserAction.id}
						onUpdateStatus={(next) =>
							updateUserActionStatus(selectedUserAction, next)
						}
						onRunVerification={() =>
							runVerificationForUserAction(selectedUserAction)
						}
						onReopenConversation={() =>
							copilot.open({ prompt: "Continue our previous conversation about this action." })
						}
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
		color:
			"border-red-500/40 bg-red-500/[0.06] shadow-[0_8px_24px_-14px_rgba(239,68,68,0.22)]",
		textColor: "text-red-600 dark:text-red-400",
	},
	improving: {
		arrow: "\u2193",
		color:
			"border-emerald-500/40 bg-emerald-500/[0.06] shadow-[0_8px_24px_-14px_rgba(16,185,129,0.22)]",
		textColor: "text-emerald-600 dark:text-emerald-400",
	},
	stable: {
		arrow: "\u2014",
		color: "border-edge bg-surface-card",
		textColor: "text-content-muted",
	},
	mixed: {
		arrow: "\u2195",
		color:
			"border-amber-500/40 bg-amber-500/[0.06] shadow-[0_8px_24px_-14px_rgba(245,158,11,0.22)]",
		textColor: "text-amber-600 dark:text-amber-400",
	},
};

function ChangeSummaryBanner({
	report,
}: {
	report: ChangeReportProjection;
}) {
	const t = useTranslations("console.actions");
	const [expanded, setExpanded] = useState(false);

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
				className='flex w-full items-center justify-between gap-3 px-4 py-3 text-left'
			>
				<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
					{/* Trend arrow + headline (built from i18n keys, not engine string) */}
					<div className='flex items-center gap-2'>
						<span className={`text-lg font-bold ${trend.textColor}`}>
							{trend.arrow}
						</span>
						<span className='text-sm text-content-secondary'>
							{[
								report.regression_count > 0 && `${report.regression_count} ${t("changeBanner.regression", { count: report.regression_count })}`,
								report.improvement_count > 0 && `${report.improvement_count} ${t("changeBanner.improvement", { count: report.improvement_count })}`,
								report.new_issue_count > 0 && `${report.new_issue_count} ${t("changeBanner.new")}`,
								report.resolved_count > 0 && `${report.resolved_count} ${t("changeBanner.resolved")}`,
							].filter(Boolean).join(", ")}
						</span>
					</div>

					{/* Count pills */}
					<div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
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
					className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${expanded ? "rotate-180" : ""}`}
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

// FixWithAiSection is imported from @/components/console/actions/FixWithAiSection

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

	// Severity drives the accent color of the impact-related sections —
	// critical/high actions get the red treatment, medium/low get amber,
	// success/info reserved for the verification + scope blocks below.
	const severityAccent: "danger" | "warning" | "default" =
		action.severity === "critical" || action.severity === "high"
			? "danger"
			: action.severity === "medium"
				? "warning"
				: "default";

	return (
		<div className='space-y-5'>
			{/* Description + Root Cause — visually connected */}
			{(action.description || action.root_cause) && (
				<DrawerStatBox>
					{action.description && (
						<div className='px-4 py-3'>
							<h3 className='mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint'>
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
							<h3 className='mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint'>
								{t("drawer.rootCause")}
							</h3>
							<span className='text-sm font-medium text-content-secondary'>
								{action.root_cause}
							</span>
						</div>
					)}
				</DrawerStatBox>
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

			{/* Wave 3.12: Hypothesis card for opportunities */}
			{action.category === "opportunity" && action.uplift_hypothesis && (
				<section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
					<h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
						{t("hypothesis.title")}
					</h4>
					<p className="text-xs leading-relaxed text-content-secondary">
						{action.uplift_hypothesis}
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-content-faint">
						{action.upside_score != null && (
							<span>{t("hypothesis.upside")}: <strong className="text-emerald-400">{action.upside_score}/100</strong></span>
						)}
						{action.effort_hint && (
							<span>{t("hypothesis.effort")}: <strong>{action.effort_hint}</strong></span>
						)}
						{action.value_case_basis && (
							<span>{t("hypothesis.basis")}: <strong>{action.value_case_basis.replace(/_/g, " ")}</strong></span>
						)}
					</div>
					{action.cluster_key && action.cluster_count && (
						<p className="mt-2 text-[10px] text-content-faint">
							{t("hypothesis.cluster", { key: action.cluster_key.replace(/_/g, " "), count: action.cluster_count })}
						</p>
					)}
				</section>
			)}

			{/* Impact Breakdown — accent + colored shadow scaled to severity */}
			{action.impact && (
				<DrawerSection
					title={t("drawer.impactBreakdown")}
					accent={severityAccent}
				>
					<DrawerStatBox accent={severityAccent}>
						<DrawerStatRow
							label={t("drawer.monthlyRange")}
							value={
								<ImpactBadge
									min={action.impact.monthly_range.min}
									max={action.impact.monthly_range.max}
								/>
							}
						/>
						<DrawerStatRow
							label={t("drawer.midpoint")}
							value={
								<ImpactBadge
									min={action.impact.midpoint}
									max={action.impact.midpoint}
									compact
								/>
							}
						/>
						<DrawerStatRow
							label={t("drawer.priorityScore")}
							value={action.priority_score}
							mono
						/>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Operational Status Timeline */}
			{action.operational_status && (
				<DrawerSection title={t("drawer.operationalStatus")} accent='info'>
					<OperationalTimeline
						category={action.category}
						currentStatus={action.operational_status}
					/>
				</DrawerSection>
			)}

			{/* Remediation Steps — only shown when the action has concrete steps */}
			{action.category !== "verification" &&
				action.remediation_steps &&
				action.remediation_steps.length > 0 && (
				<DrawerSection title={t("drawer.remediation")} accent={severityAccent}>
					<DrawerStatBox accent={severityAccent}>
						<ol className='list-none space-y-2 px-4 py-3'>
							{action.remediation_steps.map((step, i) => (
								<li
									key={i}
									className='flex items-start gap-3 text-sm leading-relaxed text-content-secondary'
								>
									<span className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-inset text-[10px] font-semibold text-content-muted'>
										{i + 1}
									</span>
									<span>{step}</span>
								</li>
							))}
						</ol>
						{action.estimated_effort_hours != null && (
							<div className='border-t border-edge/50 px-4 py-2.5'>
								<div className='flex items-center justify-between text-xs'>
									<span className='uppercase tracking-wider text-content-faint'>
										{t("drawer.estimatedEffort")}
									</span>
									<span className='font-mono font-medium text-content-secondary'>
										{t("drawer.estimatedEffortHours", {
											hours: action.estimated_effort_hours,
										})}
									</span>
								</div>
							</div>
						)}
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Fix with AI — vibecoding bridge */}
			{action.remediation_steps && action.remediation_steps.length > 0 && (
				<FixWithAiSection action={action} />
			)}

			{/* Verification Lifecycle Panel */}
			<DrawerSection title={t("drawer.verification")} accent='info'>
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
			</DrawerSection>

			{/* Verification Sufficiency Warning */}
			<VerificationSufficiencyWarning
				severity={action.severity}
				maturity={action.verification_maturity}
			/>

			{/* Scope */}
			<DrawerSection title={t("drawer.scope")}>
				<span
					className={`inline-flex rounded border px-2 py-0.5 text-xs ${
						action.cross_pack
							? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
							: "border-edge text-content-muted"
					}`}
				>
					{action.cross_pack
						? t("drawer.affectsMultiplePacks")
						: t("drawer.singlePack")}
				</span>
			</DrawerSection>

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
			<section className='space-y-2 pt-2'>
				<button
					onClick={() => onNavigateChat(action.id)}
					className='w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15 dark:text-emerald-400'
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

// ──────────────────────────────────────────────
// UserActions table + drawer — chat-Verify flow surface
// ──────────────────────────────────────────────

const USER_ACTION_STATUS_STYLES: Record<
	UserActionRow["status"],
	{ label: string; chip: string; dot: string }
> = {
	pending: {
		label: "Pending",
		chip: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
		dot: "bg-amber-500",
	},
	in_progress: {
		label: "In progress",
		chip: "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400",
		dot: "bg-sky-500",
	},
	done: {
		label: "Done",
		chip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
		dot: "bg-emerald-500",
	},
	dismissed: {
		label: "Dismissed",
		chip: "bg-zinc-500/10 border-zinc-500/30 text-content-muted",
		dot: "bg-zinc-500",
	},
};

function UserActionsTable({
	actions,
	onRowClick,
}: {
	actions: UserActionRow[];
	onRowClick: (row: UserActionRow) => void;
}) {
	const t = useTranslations("console.actions");

	if (actions.length === 0) {
		return (
			<div className='rounded-lg border border-dashed border-edge bg-surface-card/50 px-6 py-10 text-center'>
				<p className='text-sm text-content-muted'>{t("mineEmpty.title")}</p>
				<p className='mt-1 text-xs text-content-faint'>
					{t("mineEmpty.description")}
				</p>
			</div>
		);
	}

	const columns: Column<UserActionRow>[] = [
		{
			key: "title",
			label: t("columns.action"),
			className: "min-w-[240px]",
			render: (row) => (
				<div>
					<div className='text-sm text-content-secondary'>{row.title}</div>
					{row.description && (
						<div className='mt-0.5 line-clamp-1 text-xs text-content-muted'>
							{row.description}
						</div>
					)}
				</div>
			),
		},
		{
			key: "status",
			label: t("columns.status"),
			className: "w-32",
			render: (row) => {
				const cfg = USER_ACTION_STATUS_STYLES[row.status];
				return (
					<span
						className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.chip}`}
					>
						<span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
						{cfg.label}
					</span>
				);
			},
		},
		{
			key: "baseline",
			label: t("columns.baselineImpact"),
			className: "w-36",
			render: (row) =>
				row.baseline_impact_midpoint !== null ? (
					<span className='font-mono text-xs text-content-secondary'>
						{formatCurrency(row.baseline_impact_midpoint)}/mo
					</span>
				) : (
					<span className='text-xs text-content-faint'>--</span>
				),
		},
		{
			key: "effort",
			label: t("columns.effort"),
			className: "w-20",
			render: (row) =>
				row.estimated_effort_hours !== null ? (
					<span className='text-xs text-content-muted'>
						~{row.estimated_effort_hours}h
					</span>
				) : (
					<span className='text-xs text-content-faint'>--</span>
				),
		},
		{
			key: "created",
			label: t("columns.created"),
			className: "w-28",
			render: (row) => (
				<span className='font-mono text-xs text-content-muted'>
					{new Date(row.created_at).toLocaleDateString()}
				</span>
			),
		},
	];

	return (
		<DataTable
			columns={columns}
			data={actions}
			onRowClick={onRowClick}
			getRowKey={(row) => row.id}
		/>
	);
}

function UserActionDrawerContent({
	action,
	mutating,
	onUpdateStatus,
	onRunVerification,
	onReopenConversation,
}: {
	action: UserActionRow;
	mutating: boolean;
	onUpdateStatus: (next: UserActionRow["status"]) => void;
	onRunVerification: () => void;
	onReopenConversation: (conversationId: string) => void;
}) {
	const t = useTranslations("console.actions.drawer.mine");
	const tcols = useTranslations("console.actions.columns");
	const cfg = USER_ACTION_STATUS_STYLES[action.status];
	const steps = Array.isArray(action.remediation_steps)
		? action.remediation_steps
		: [];

	const transitions: Array<{
		key: UserActionRow["status"];
		label: string;
		hidden?: boolean;
		emphasize?: boolean;
	}> = [
		{
			key: "in_progress",
			label: t("markInProgress"),
			hidden: action.status === "in_progress" || action.status === "done",
			emphasize: action.status === "pending",
		},
		{
			key: "done",
			label: t("markDone"),
			hidden: action.status === "done",
			emphasize: action.status === "in_progress",
		},
		{
			key: "pending",
			label: t("reopen"),
			hidden: action.status === "pending" || action.status === "in_progress",
		},
		{
			key: "dismissed",
			label: t("dismiss"),
			hidden: action.status === "dismissed" || action.status === "done",
		},
	];

	return (
		<div className='space-y-6'>
			{/* Status + Created */}
			<DrawerSection title={t("status")} accent='info'>
				<DrawerStatBox accent='info'>
					<div className='space-y-2 px-4 py-3 text-sm'>
						<div className='flex items-center gap-2'>
							<span
								className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.chip}`}
							>
								<span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
								{cfg.label}
							</span>
						</div>
						<DrawerStatRow
							label={t("created")}
							value={
								<span className='font-mono text-xs text-content-muted'>
									{new Date(action.created_at).toLocaleString()}
								</span>
							}
						/>
						{action.done_at && (
							<DrawerStatRow
								label={t("doneAt")}
								value={
									<span className='font-mono text-xs text-content-muted'>
										{new Date(action.done_at).toLocaleString()}
									</span>
								}
							/>
						)}
						{action.baseline_impact_midpoint !== null && (
							<DrawerStatRow
								label={tcols("baselineImpact")}
								value={
									<span className='font-mono text-xs text-content-secondary'>
										{formatCurrency(action.baseline_impact_midpoint)}/mo
									</span>
								}
							/>
						)}
						{action.estimated_effort_hours !== null && (
							<DrawerStatRow
								label={tcols("effort")}
								value={
									<span className='text-xs text-content-muted'>
										~{action.estimated_effort_hours}h
									</span>
								}
							/>
						)}
					</div>
				</DrawerStatBox>
			</DrawerSection>

			{/* Lifecycle transitions */}
			<DrawerSection title={t("lifecycle")} accent='info'>
				<div className='flex flex-wrap gap-2'>
					{transitions
						.filter((x) => !x.hidden)
						.map((x) => (
							<button
								key={x.key}
								type='button'
								onClick={() => onUpdateStatus(x.key)}
								disabled={mutating}
								className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
									x.emphasize
										? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
										: "border-edge bg-surface-card text-content-secondary hover:bg-surface-card-hover"
								}`}
							>
								{mutating ? t("updating") : x.label}
							</button>
						))}
				</div>
			</DrawerSection>

			{/* Run verification cycle now — the credit-gated impatience
			    escape. Only shown while the action is actionable (not
			    already confirmed or dismissed). Clicking marks done +
			    kicks off a hot-tier cycle. Attribution job stamps the
			    confirmation + fires the celebration email when done. */}
			{action.status !== "dismissed" && !action.verified_resolved_at && (
				<DrawerSection title={t("runVerificationTitle")} accent='info'>
					<button
						type='button'
						onClick={onRunVerification}
						disabled={mutating}
						className='w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-400'
					>
						{mutating
							? t("triggeringCycle")
							: t("runVerificationCta")}
					</button>
					<p className='mt-1.5 text-[11px] leading-snug text-content-muted'>
						{t("runVerificationHint")}
					</p>
				</DrawerSection>
			)}

			{/* Already confirmed badge — no CTA here, just closure. */}
			{action.verified_resolved_at && (
				<DrawerSection title={t("confirmedTitle")} accent='success'>
					<div className='rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-600 dark:text-emerald-400'>
						{t("confirmedBody", {
							when: new Date(action.verified_resolved_at).toLocaleString(),
						})}
					</div>
				</DrawerSection>
			)}

			{/* Description */}
			{action.description && (
				<DrawerSection title={t("description")}>
					<p className='rounded-md border border-edge bg-surface-card px-4 py-3 text-sm leading-relaxed text-content-muted'>
						{action.description}
					</p>
				</DrawerSection>
			)}

			{/* Remediation steps */}
			{steps.length > 0 && (
				<DrawerSection title={t("remediation")} accent='info'>
					<DrawerStatBox accent='info'>
						<ol className='space-y-2 px-4 py-3 text-sm leading-relaxed text-content-secondary'>
							{steps.map((step, idx) => (
								<li key={idx} className='flex items-start gap-2'>
									<span className='mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-edge text-[10px] font-semibold text-content-muted'>
										{idx + 1}
									</span>
									<span>{step}</span>
								</li>
							))}
						</ol>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Link back to the verification conversation */}
			{action.verified_via_conversation_id && (
				<DrawerSection title={t("origin")}>
					<button
						type='button'
						onClick={() =>
							onReopenConversation(action.verified_via_conversation_id!)
						}
						className='w-full rounded-md border border-edge bg-surface-card px-4 py-2.5 text-left text-sm text-content-secondary transition-colors hover:border-amber-500/30 hover:bg-amber-500/5 hover:text-content'
					>
						<span className='font-medium'>{t("reopenConversation")}</span>
						<span className='mt-0.5 block text-xs text-content-muted'>
							{t("reopenConversationHint")}
						</span>
					</button>
				</DrawerSection>
			)}

			{/* Finding link — for navigation back to the source finding */}
			<DrawerSection title={t("sourceFinding")}>
				<a
					href={`/app/findings?finding=${encodeURIComponent(action.finding_id)}`}
					className='inline-flex items-center gap-1 text-xs text-content-muted hover:text-content-secondary hover:underline'
				>
					{action.finding_id}
				</a>
			</DrawerSection>
		</div>
	);
}
