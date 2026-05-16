"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { useTrack } from "@/hooks/useProductTrack";
import { useCopilot } from "@/components/app/CopilotProvider";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import FixWithAiSection from "@/components/console/actions/FixWithAiSection";
import ScatterPlot from "@/components/console/actions/ScatterPlot";
import DecidirPopover from "@/components/console/actions/DecidirPopover";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import CustomSelect from "@/components/console/CustomSelect";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import ChangeSummaryBanner from "@/components/console/ChangeSummaryBanner";
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
	{ labelKey: string; dotColor: string; badgeStyle: string }
> = {
	incident: {
		labelKey: "incident",
		dotColor: "bg-red-500",
		badgeStyle:
			"bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
	},
	opportunity: {
		labelKey: "opportunity",
		dotColor: "bg-emerald-500",
		badgeStyle:
			"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
	},
	verification: {
		labelKey: "verification",
		dotColor: "bg-blue-500",
		badgeStyle:
			"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
	},
	observation: {
		labelKey: "observation",
		dotColor: "bg-zinc-500",
		badgeStyle: "bg-zinc-500/10 text-content-muted border-zinc-500/20",
	},
};

const effortConfig: Record<string, { labelKey: string; style: string }> = {
	trivial: {
		labelKey: "trivial",
		style: "text-emerald-600 dark:text-emerald-400",
	},
	low: { labelKey: "low", style: "text-blue-600 dark:text-blue-400" },
	medium: { labelKey: "medium", style: "text-amber-600 dark:text-amber-400" },
	high: { labelKey: "high", style: "text-orange-600 dark:text-orange-400" },
	very_high: { labelKey: "very_high", style: "text-red-600 dark:text-red-400" },
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

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BRL: "R$", EUR: "€" };
function formatCurrency(value: number, sym: string = "$"): string {
	if (value >= 1000000) return `${sym}${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`;
	return `${sym}${Math.round(value)}`;
}

// Wave 15.2: cadence guidance per verification strategy. Maps to i18n keys
// under console.actions.drawer.cadence.<strategy>. Null = strategy isn't
// auto-re-verifiable on a fixed cadence (manual / data-gated / never).
const VERIFICATION_CADENCE_KEY: Record<string, string | null> = {
	http_static: "daily",
	browser_runtime: "weekly",
	integration_pull: "daily",
	external_scan: "monthly",
	pixel_accumulation: "session_gated",
	heuristic_recompute: "every_audit",
	reuse_only: null,
	not_verifiable_explain: "manual",
};

function buildRemediationPrompt(
	action: ActionProjection,
	t: (key: string, values?: Record<string, string>) => string,
): string {
	const steps =
		action.remediation_steps
			?.map((s, i) => `${i + 1}. ${s}`)
			.join("\n") || "";
	const cause = action.root_cause || t("decidir.prompt_root_cause_unknown");
	const lines = [
		t("decidir.prompt_analyzing", { title: action.title, severity: action.severity }),
	];
	if (action.impact?.midpoint) {
		lines.push(t("decidir.prompt_estimated_recovery", { impact: formatCurrency(action.impact.midpoint, "$") }));
	}
	lines.push("", t("decidir.prompt_root_cause", { cause }));
	if (steps) {
		lines.push("", t("decidir.prompt_steps_heading"), steps);
	}
	lines.push("", t("decidir.prompt_instruction"));
	return lines.join("\n");
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
	const tc = useTranslations("console.common");
	const { track } = useTrack();
	const router = useRouter();
	const copilot = useCopilot();
	const { currency: orgCurrency } = useMcpData();
	const currSym = CURRENCY_SYMBOLS[orgCurrency] || "$";
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

	// Deep-link support: opens the matching action's drawer when the URL
	// carries either `?action=<id>` (used by chat ActionCard cards and
	// the linked-actions list in the findings drawer — exact id match)
	// or `?selected=<key>` (used by the dashboard's OpenCriticalKpi tile
	// — fuzzy match against the action_key, which often embeds the
	// inferenceKey). Drops the consumed param from the URL afterwards
	// so a browser back-button doesn't re-trigger the open.
	useEffect(() => {
		if (actions.length === 0) return;
		const actionId = searchParams?.get("action");
		const selectedKey = searchParams?.get("selected");
		const key = actionId ?? selectedKey;
		if (!key) return;
		const match =
			actions.find((a) => a.id === key) ||
			actions.find((a) => a.id.includes(key) || key.includes(a.id));
		if (match) setSelected(match);
		const url = new URL(window.location.href);
		if (actionId) url.searchParams.delete("action");
		if (selectedKey) url.searchParams.delete("selected");
		window.history.replaceState({}, "", url.toString());
	}, [searchParams, actions]);
	// Wave 0.6: Track which action is currently being verified so the
	// drawer button shows a spinner instead of relying on a global state.
	const [verifyingId, setVerifyingId] = useState<string | null>(null);

	// Filtered actions based on filter bar (pipeline tab)
	// Wave 15.2: deep-link filter — /app/actions?surface=<url> filters to
	// actions where affected_surfaces includes the URL. Used by the
	// inventory page's "View linked actions" button for 2-way binding.
	const surfaceFilter = searchParams?.get("surface") ?? null;

	const filtered = useMemo(() => {
		let result = actions;
		if (typeFilter !== "all") result = result.filter(a => a.category === typeFilter);
		if (severityFilter !== "all") result = result.filter(a => a.severity === severityFilter);
		if (effortFilter !== "all") {
			if (effortFilter === "low") result = result.filter(a => a.effort_hint === "trivial" || a.effort_hint === "low");
			else if (effortFilter === "medium") result = result.filter(a => a.effort_hint === "medium");
			else if (effortFilter === "high") result = result.filter(a => a.effort_hint === "high" || a.effort_hint === "very_high");
		}
		if (surfaceFilter) {
			result = result.filter(a => a.affected_surfaces?.includes(surfaceFilter));
		}
		return result;
	}, [actions, typeFilter, severityFilter, effortFilter, surfaceFilter]);

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

	// Reconcile change report counts and detail arrays with actual action
	// projections. The change report counts decisions (finding-level), but
	// the table shows actions (root-cause-grouped). Without reconciliation,
	// the banner can show "4 new" while only 3 rows exist in the table,
	// confusing users who expect a 1:1 match. We also filter the detail
	// arrays so the expanded timeline only shows changes that produced a
	// visible action row.
	const reconciledChangeReport = useMemo(() => {
		if (!changeReport) return null;

		// Filter helper: keep a decision change only if its decision_key
		// matches an action (same fuzzy logic as buildActionChangeClass).
		const hasMatchingAction = (dk: string) =>
			actions.some(a => a.id.includes(dk) || dk.includes(a.id));

		const newIssues = changeReport.new_issues.filter(c => hasMatchingAction(c.decision_key));
		const regressions = changeReport.regressions.filter(c => hasMatchingAction(c.decision_key));
		const resolved = changeReport.resolved.filter(c => hasMatchingAction(c.decision_key));
		const improvements = changeReport.improvements.filter(c => hasMatchingAction(c.decision_key));

		return {
			...changeReport,
			new_issues: newIssues,
			regressions,
			resolved,
			improvements,
			new_issue_count: newIssues.length,
			regression_count: regressions.length,
			resolved_count: resolved.length,
			improvement_count: improvements.length,
		};
	}, [changeReport, actions]);

	const cards: SummaryCard[] = [
		{
			label: t("cards.totalExposure"),
			value:
				totalImpact >= 1000
					? `${formatCurrency(totalImpact, currSym)}`
					: `${currSym}${totalImpact}`,
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
					? `${formatCurrency(capturedValue, currSym)}`
					: `${currSym}${capturedValue}`,
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
							+{formatCurrency(row.impact.midpoint, currSym)}
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
				return (
					<span className='inline-flex items-center rounded-full border border-edge px-2 py-0.5 text-xs text-content-secondary'>
						{t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}
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
			key: "decide",
			label: t("columns.nextStep"),
			className: "w-28",
			render: (row) => (
				<DecidirPopover
					action={row}
					onPlanRemediation={(a) => {
						copilot.open({ action: { id: a.id, title: a.title }, prompt: buildRemediationPrompt(a, t) });
						track("decidir_plan", { action_id: a.id });
					}}
					onDiscuss={(a) => {
						copilot.open({ action: { id: a.id, title: a.title } });
						track("decidir_discuss", { action_id: a.id });
					}}
					onRunVerification={(a) => {
						runVerification(a, "re_verify");
						track("decidir_verify", { action_id: a.id });
					}}
					onMarkResolved={(a) => {
						runVerification(a, "confirm_resolution");
						track("decidir_resolve", { action_id: a.id });
					}}
					verificationDisabled={
						!row.verification_strategy &&
						row.category !== "verification" &&
						row.category !== "opportunity"
					}
					isVerifying={verifyingId !== null}
				/>
			),
		},
	];

	return (
		<>
			{/* Summary Cards */}
			<div className='mb-6'>
				<SummaryCards cards={cards} />
			</div>

			{/* Change Summary Banner */}
			{reconciledChangeReport && (
				<div className='mb-4'>
					<ChangeSummaryBanner report={reconciledChangeReport} />
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
						{ value: "critical", label: tc("severity.critical") },
						{ value: "high", label: tc("severity.high") },
						{ value: "medium", label: tc("severity.medium") },
						{ value: "low", label: tc("severity.low") },
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
						onNavigateChat={() => copilot.open({ prompt: t("drawer.prompt_discuss", { title: selected!.title }) })}
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
							copilot.open({ prompt: t("drawer.prompt_continue") })
						}
					/>
				)}
			</SideDrawer>
		</>
	);
}

// ──────────────────────────────────────────────
// Category Badge
// ──────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
	const t = useTranslations("console.actions.categories");
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
			{t(cfg.labelKey)}
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
	onNavigateChat: () => void;
	onRunVerification: (intent: "re_verify" | "confirm_resolution") => void;
	isVerifying: boolean;
}) {
	const t = useTranslations("console.actions");
	const { currency: orgCurrency } = useMcpData();
	const currSym = CURRENCY_SYMBOLS[orgCurrency] || "$";
	const cfg = categoryConfig[action.category];

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
							{effortConfig[action.effort_hint] ? t(`effort.${effortConfig[action.effort_hint].labelKey}`) : action.effort_hint}{" "}
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

			{/* Impact Breakdown — accent + colored shadow scaled to severity.
			    Wave 15.1: added daily-burn row + priority rationale subtitle. */}
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
						{/* Wave 15.1: Daily cost of delay — hammers "fix this NOW" */}
						<DrawerStatRow
							label={t("drawer.dailyBurnLabel")}
							value={
								<span className="text-xs font-mono font-medium text-content-secondary">
									{t("drawer.dailyBurn", { amount: formatCurrency(action.impact.midpoint / 30, currSym) })}
								</span>
							}
						/>
						<DrawerStatRow
							label={t("drawer.priorityScore")}
							value={action.priority_score >= 5000 ? t("drawer.priority_critical") : action.priority_score >= 2000 ? t("drawer.priority_high") : action.priority_score >= 500 ? t("drawer.priority_medium") : t("drawer.priority_low")}
						/>
						{/* Wave 15.1: Priority rationale — explains WHY this priority */}
						<div className="border-t border-edge/50 px-4 py-2 text-[10px] text-content-faint leading-relaxed">
							{t("drawer.priorityRationale")}: {t("drawer.priorityFormula", {
								impact: formatCurrency(action.impact.midpoint, currSym),
								crossPack: action.cross_pack ? t("drawer.crossPackBoost") : "",
							})}
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Wave 15.1 — Contexto section.
			    Surfaces change history, cluster relationships, and confidence
			    basis so the user understands WHY NOW + WHY TRUST this action.
			    Only renders if at least one signal is present. */}
			{(action.change_class || (action.cluster_count && action.cluster_count > 1) || action.value_case_basis) && (
				<DrawerSection title={t("drawer.contextTitle")} accent="info">
					<DrawerStatBox>
						{action.change_class && (
							<div className="flex items-start gap-2.5 px-4 py-3">
								<span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
									action.change_class === "regression" || action.change_class === "new_issue"
										? "bg-red-500/10 text-red-500"
										: action.change_class === "improvement" || action.change_class === "resolved"
										? "bg-emerald-500/10 text-emerald-500"
										: "bg-amber-500/10 text-amber-500"
								}`}>
									{action.change_class === "regression" ? "↗" :
									 action.change_class === "improvement" ? "↘" :
									 action.change_class === "new_issue" ? "!" :
									 action.change_class === "resolved" ? "✓" : "⏳"}
								</span>
								<span className="text-sm leading-relaxed text-content-secondary">
									{t(`drawer.changeNarrative.${action.change_class}`)}
								</span>
							</div>
						)}
						{action.cluster_count && action.cluster_count > 1 && (
							<>
								{action.change_class && <div className="border-t border-edge/50" />}
								<div className="flex items-start gap-2.5 px-4 py-3">
									<span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[11px] text-emerald-500">
										⚭
									</span>
									<span className="text-sm leading-relaxed text-content-secondary">
										{t("drawer.clusterText", { count: action.cluster_count })}
									</span>
								</div>
							</>
						)}
						{action.value_case_basis && (
							<>
								{(action.change_class || (action.cluster_count && action.cluster_count > 1)) && <div className="border-t border-edge/50" />}
								<div className="flex items-start gap-2.5 px-4 py-3">
									<span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[11px] text-blue-500">
										ⓘ
									</span>
									<span className="text-sm leading-relaxed text-content-secondary">
										{t(`drawer.basis.${action.value_case_basis}`)}
									</span>
								</div>
							</>
						)}
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

			{/* Wave 15 — Findings that justify this action.
			    Walks RootCause.contributing_inferences → FindingProjections so
			    the user sees WHICH findings the action addresses. Clicking a
			    row deep-links to /app/findings filtered to that finding. */}
			{action.linked_findings && action.linked_findings.length > 0 && (
				<DrawerSection title={t("drawer.linkedFindings")}>
					<DrawerStatBox>
						<ul className='divide-y divide-edge/50'>
							{action.linked_findings.map((f) => (
								<li key={f.id} className='px-4 py-2.5'>
									<a
										href={`/app/findings?finding=${encodeURIComponent(f.id)}`}
										className='group block'
									>
										<div className='flex items-start gap-2'>
											<SeverityBadge value={f.severity} />
											<div className='min-w-0 flex-1'>
												<div className='truncate text-sm font-medium text-content-secondary group-hover:text-accent'>
													{f.title}
												</div>
												<div className='mt-0.5 truncate text-[10px] text-content-faint'>
													{f.inference_key}
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
										</div>
									</a>
								</li>
							))}
						</ul>
						<div className='border-t border-edge/50 px-4 py-2 text-[10px] text-content-faint'>
							{t("drawer.linkedFindingsCount", { count: action.linked_findings.length })}
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Wave 15.2 — Affected Surfaces.
			    URL list resolved from evidence_refs. Each row deep-links to
			    /app/inventory filtered by surface, closing the 2-way binding
			    with the inventory page which shows actions per surface. */}
			{action.affected_surfaces && action.affected_surfaces.length > 0 && (
				<DrawerSection title={t("drawer.affectedSurfaces")} accent="info">
					<DrawerStatBox>
						<ul className='divide-y divide-edge/50'>
							{action.affected_surfaces.slice(0, 8).map((url) => (
								<li key={url} className='px-4 py-2'>
									<a
										href={`/app/inventory?surface=${encodeURIComponent(url)}`}
										className='group flex items-start gap-2 text-xs leading-relaxed text-content-secondary hover:text-accent'
									>
										<span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-content-faint group-hover:bg-accent" />
										<span className="truncate font-mono">{url}</span>
									</a>
								</li>
							))}
						</ul>
						{action.affected_surfaces.length > 8 && (
							<div className='border-t border-edge/50 px-4 py-2 text-[10px] text-content-faint'>
								{t("drawer.affectedSurfacesMore", { count: action.affected_surfaces.length - 8 })}
							</div>
						)}
						<div className='border-t border-edge/50 px-4 py-2 text-[10px] text-content-faint'>
							{t("drawer.affectedSurfacesCount", { count: action.affected_surfaces.length })}
						</div>
					</DrawerStatBox>
				</DrawerSection>
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
				{/* Wave 15.2 — Verification cadence guidance per strategy.
				    Tells the user how often re-verification makes sense. */}
				{action.verification_strategy && VERIFICATION_CADENCE_KEY[action.verification_strategy] && (
					<div className='mt-3 border-t border-edge/50 pt-2.5'>
						<div className='flex items-start gap-2 text-[11px] leading-relaxed text-content-muted'>
							<span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] text-blue-500">⟳</span>
							<span>
								<span className="font-medium text-content-secondary">{t("drawer.verificationCadenceLabel")}:</span>{" "}
								{t(`drawer.cadence.${VERIFICATION_CADENCE_KEY[action.verification_strategy]}`)}
							</span>
						</div>
					</div>
				)}
				{/* Primary verification CTA — lives INSIDE the verification card so
				    the action is co-located with the cadence guidance and the
				    lifecycle panel that explains what verification means. */}
				<div className='mt-3 border-t border-edge/50 pt-3'>
					<button
						type='button'
						onClick={() => onRunVerification("re_verify")}
						disabled={isVerifying}
						className='w-full rounded-md border border-emerald-500/40 px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:border-emerald-500 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-50'
					>
						{isVerifying
							? t("drawer.verificationRunning")
							: t("decidir.runVerification")}
					</button>
				</div>
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

			{/* Action Buttons. The fix / track / dismiss bottom CTAs were
			    previously rendered with an empty onClick (placeholder for
			    pipelines that don't exist yet) — looked clickable, did
			    nothing. Removed until those pipelines exist. The
			    verification CTA already lives in its own card; Discuss
			    in Chat is always available. */}
			<section className='space-y-2 pt-2'>
				<button
					onClick={() => onNavigateChat()}
					className='w-full rounded-md border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5'
				>
					{t("drawer.discussInChat")}
				</button>
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
	const t = useTranslations("console.actions.statuses");
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
									{t.has(step) ? t(step) : step.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}
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
	{ labelKey: string; chip: string; dot: string }
> = {
	pending: {
		labelKey: "pending",
		chip: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
		dot: "bg-amber-500",
	},
	in_progress: {
		labelKey: "in_progress",
		chip: "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400",
		dot: "bg-sky-500",
	},
	done: {
		labelKey: "done",
		chip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
		dot: "bg-emerald-500",
	},
	dismissed: {
		labelKey: "dismissed",
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
	const locale = useLocale();
	const { currency: orgCurrency } = useMcpData();
	const currSym = CURRENCY_SYMBOLS[orgCurrency] || "$";

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
						{t(`user_action_statuses.${cfg.labelKey}`)}
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
						{formatCurrency(row.baseline_impact_midpoint, currSym)}/mo
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
					{formatDate(row.created_at, locale)}
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
	const tStatus = useTranslations("console.actions.user_action_statuses");
	const { currency: orgCurrency } = useMcpData();
	const currSym = CURRENCY_SYMBOLS[orgCurrency] || "$";
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
								{tStatus(cfg.labelKey)}
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
										{formatCurrency(action.baseline_impact_midpoint, currSym)}/mo
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
