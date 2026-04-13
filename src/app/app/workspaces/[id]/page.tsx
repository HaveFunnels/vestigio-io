"use client";

import { useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import { loadWorkspaces, loadChangeReport } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
	WorkspaceProjection,
	FindingProjection,
	DecisionChangeProjection,
} from "../../../../../packages/projections";

// ──────────────────────────────────────────────
// Workspace Detail — aligned with industrial-editorial design
// ──────────────────────────────────────────────

const PERSPECTIVE_META: Record<string, { label: string; color: string; border: string; slug: string }> = {
	revenue: { label: "Receita", color: "text-red-400", border: "border-l-red-500/60", slug: "revenue" },
	chargeback: { label: "Receita", color: "text-red-400", border: "border-l-red-500/60", slug: "revenue" },
	preflight: { label: "Confiança", color: "text-amber-400", border: "border-l-amber-500/60", slug: "trust" },
	security_posture: { label: "Confiança", color: "text-amber-400", border: "border-l-amber-500/60", slug: "trust" },
};

function getPerspective(type: string, category: string) {
	if (category === "behavioral") return { label: "Comportamento", color: "text-violet-400", border: "border-l-violet-500/60", slug: "behavior" };
	return PERSPECTIVE_META[type] || { label: "Confiança", color: "text-amber-400", border: "border-l-amber-500/60", slug: "trust" };
}

function fmtCurrency(value: number): string {
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
	return `$${Math.round(value)}`;
}

export default function WorkspaceDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const mcpData = useMcpData();
	const dataState =
		mcpData.workspaces.status !== "not_ready"
			? mcpData.workspaces
			: loadWorkspaces();
	const t = useTranslations("console.workspaces");

	return (
		<div className="p-6">
			<ConsoleState
				state={dataState}
				loadingLabel={t("detail.loading")}
				emptyLabel={t("empty")}
			>
				{(workspaces) => {
					const workspace = workspaces.find((w) => w.id === id);
					if (!workspace) {
						return (
							<div className="flex flex-col items-center justify-center py-24 text-center">
								<div className="mb-3 text-4xl text-zinc-300 dark:text-zinc-700">&empty;</div>
								<h2 className="text-lg font-semibold text-zinc-600 dark:text-zinc-300">
									{t("detail.not_found")}
								</h2>
								<Link
									href="/app/workspaces"
									className="mt-4 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
								>
									&larr; {t("detail.back_to_workspaces")}
								</Link>
							</div>
						);
					}
					return <WorkspaceDetail workspace={workspace} />;
				}}
			</ConsoleState>
		</div>
	);
}

// ──────────────────────────────────────────────
// Main Detail
// ──────────────────────────────────────────────

function WorkspaceDetail({ workspace }: { workspace: WorkspaceProjection }) {
	const router = useRouter();
	const mcpData = useMcpData();
	const t = useTranslations("console.workspaces");
	const tc = useTranslations("console.common");
	const [selectedFinding, setSelectedFinding] = useState<FindingProjection | null>(null);

	const perspective = getPerspective(workspace.type, workspace.category);

	const changeReportState =
		mcpData.changeReport.status !== "not_ready"
			? mcpData.changeReport
			: loadChangeReport();

	const workspaceChanges: DecisionChangeProjection[] = useMemo(() => {
		if (changeReportState.status !== "ready") return [];
		const report = changeReportState.data;
		const all = [...report.regressions, ...report.improvements, ...report.new_issues, ...report.resolved];
		return all.filter((c) => c.decision_key === workspace.decision_key);
	}, [changeReportState, workspace.decision_key]);

	const negativeFindings = workspace.findings.filter((f) => f.polarity === "negative");
	const positiveFindings = workspace.findings.filter((f) => f.polarity === "positive");
	const topSeverity = getTopSeverity(workspace.findings);

	const isPreflight = workspace.type === "preflight";
	const preflightReadiness = isPreflight ? computePreflightReadiness(workspace.findings) : null;

	const findingColumns: Column<FindingProjection>[] = [
		{
			key: "title",
			label: tc("columns.finding"),
			render: (row) => (
				<div>
					<div className="text-[13px] text-zinc-700 dark:text-zinc-300">{row.title}</div>
					{row.root_cause && <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">{row.root_cause}</div>}
				</div>
			),
		},
		{
			key: "severity",
			label: tc("columns.severity"),
			className: "w-24",
			render: (row) => <SeverityBadge value={row.severity} />,
		},
		{
			key: "impact",
			label: tc("columns.impact"),
			className: "w-44",
			render: (row) =>
				row.polarity === "positive" ? (
					<span className="text-[11px] text-emerald-600 dark:text-emerald-400">{tc("healthy")}</span>
				) : (
					<ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} />
				),
		},
		{
			key: "verification",
			label: tc("columns.verification"),
			className: "w-28",
			render: (row) => <VerificationBadge value={row.verification_maturity} />,
		},
		{
			key: "change",
			label: tc("columns.change"),
			className: "w-28",
			render: (row) => <ChangeBadge value={row.change_class} />,
		},
	];

	return (
		<>
			{/* ── Breadcrumb ── */}
			<nav className="flex items-center gap-1.5 text-[12px]">
				<Link href="/app/workspaces" className="text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400">
					Workspaces
				</Link>
				<span className="text-zinc-300 dark:text-zinc-700">/</span>
				<Link
					href={`/app/workspaces/perspective/${perspective.slug}`}
					className={`transition-colors hover:opacity-80 ${perspective.color}`}
				>
					{perspective.label}
				</Link>
				<span className="text-zinc-300 dark:text-zinc-700">/</span>
				<span className="text-zinc-600 dark:text-zinc-400">{workspace.name}</span>
			</nav>

			{/* ── Header — left accent border ── */}
			<div className={`mt-4 rounded border-l-2 ${perspective.border} px-5 py-4`}>
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-[16px] font-semibold text-zinc-800 dark:text-zinc-200">
							{workspace.name}
						</h1>
						<div className="mt-1.5 flex flex-wrap items-center gap-2">
							<SeverityBadge value={workspace.decision_impact} />
							<WorkspaceChangeTrend summary={workspace.change_summary} />
						</div>
					</div>
					<div className="flex items-center gap-6">
						<div className="text-right">
							<div className="font-[family-name:var(--font-jetbrains-mono)] text-[20px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
								{workspace.summary.issue_count}
							</div>
							<div className="text-[10px] text-zinc-400 dark:text-zinc-600">{t("issues")}</div>
						</div>
						{workspace.summary.total_loss_mid > 0 && (
							<div className="text-right">
								<div className={`font-[family-name:var(--font-jetbrains-mono)] text-[20px] font-bold tabular-nums ${perspective.color}`}>
									{fmtCurrency(workspace.summary.total_loss_mid)}
								</div>
								<div className="text-[10px] text-zinc-400 dark:text-zinc-600">/mo</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* ── Two-column layout ── */}
			<div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
				{/* Left: Changes + Findings */}
				<div className="space-y-5">
					{/* Change Summary */}
					{(workspace.change_summary || workspaceChanges.length > 0) && (
						<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
							<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
								{t("detail.change_summary")}
							</h2>
							{workspace.change_summary && <TrendHeadline summary={workspace.change_summary} />}
							{workspaceChanges.length > 0 && (
								<div className="mt-3">
									<ChangeTimeline changes={workspaceChanges} maxItems={8} />
								</div>
							)}
							{!workspace.change_summary && workspaceChanges.length === 0 && (
								<p className="text-[12px] text-zinc-400 dark:text-zinc-600">{t("detail.no_changes")}</p>
							)}
						</section>
					)}

					{/* Findings */}
					<section className="rounded-2xl border border-edge bg-surface-card shadow-lg">
						<div className="px-5 pt-5 pb-2">
							<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
								{isPreflight ? t("detail.preflight_checklist") : t("detail.findings")}
							</h2>
						</div>

						{isPreflight && preflightReadiness ? (
							<div className="px-5 pb-5">
								<PreflightChecklist
									findings={workspace.findings}
									readiness={preflightReadiness}
									onFindingClick={(f) => setSelectedFinding(f)}
								/>
							</div>
						) : (
							<DataTable
								columns={findingColumns}
								data={workspace.findings}
								onRowClick={(row) => setSelectedFinding(row)}
								getRowKey={(row) => row.id}
								emptyMessage={t("detail.no_findings")}
							/>
						)}
					</section>
				</div>

				{/* Right: Coherence + Stats */}
				<div className="space-y-5">
					{/* Coherence */}
					{workspace.coherence && (
						<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
							<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
								{t("detail.coherence")}
							</h2>
							<div className="space-y-3">
								<div>
									<div className="mb-1 flex items-center justify-between">
										<span className="text-[11px] text-zinc-500">{t("detail.coherence_score")}</span>
										<span className={`font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-semibold tabular-nums ${
											workspace.coherence.coherence_score >= 70 ? "text-emerald-500" :
											workspace.coherence.coherence_score >= 40 ? "text-amber-500" : "text-red-500"
										}`}>
											{workspace.coherence.coherence_score}
										</span>
									</div>
									<div className="h-[4px] w-full rounded-sm bg-zinc-100 dark:bg-white/[0.04]">
										<div
											className={`h-full rounded-sm transition-all ${
												workspace.coherence.coherence_score >= 70 ? "bg-emerald-500" :
												workspace.coherence.coherence_score >= 40 ? "bg-amber-500" : "bg-red-500"
											}`}
											style={{ width: `${Math.min(100, workspace.coherence.coherence_score)}%` }}
										/>
									</div>
								</div>
								{workspace.coherence.conflict_annotations.length > 0 && (
									<div className="space-y-1.5">
										{workspace.coherence.conflict_annotations.map((note, i) => (
											<div key={i} className="rounded border-l-2 border-l-amber-500/60 bg-amber-50 px-3 py-2 dark:bg-amber-500/[0.04]">
												<p className="text-[11px] text-amber-700 dark:text-amber-300/90">{note}</p>
											</div>
										))}
									</div>
								)}
								{workspace.coherence.suppressed && (
									<div className="rounded border-l-2 border-l-red-500/60 bg-red-50 px-3 py-2 dark:bg-red-500/[0.04]">
										<p className="text-[11px] text-red-700 dark:text-red-300/90">{t("detail.suppressed_by_pack")}</p>
									</div>
								)}
							</div>
						</section>
					)}

					{/* Quick Stats */}
					<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
						<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
							{t("detail.quick_stats")}
						</h2>
						<div className="grid grid-cols-2 gap-3">
							<StatCard label={t("detail.negative_findings")} value={negativeFindings.length} color="text-red-500 dark:text-red-400" />
							<StatCard label={t("detail.positive_findings")} value={positiveFindings.length} color="text-emerald-600 dark:text-emerald-400" />
							<StatCard
								label={t("detail.top_severity")}
								value={topSeverity}
								color={topSeverity === "critical" ? "text-red-500 dark:text-red-400" :
									topSeverity === "high" ? "text-orange-500 dark:text-orange-400" :
									topSeverity === "medium" ? "text-amber-500 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"}
							/>
						</div>
					</section>
				</div>
			</div>

			{/* ── Finding Drawer ── */}
			<SideDrawer open={selectedFinding !== null} onClose={() => setSelectedFinding(null)} title={selectedFinding?.title || ""}>
				{selectedFinding && (
					<FindingDrawerContent
						finding={selectedFinding}
						onDiscuss={() => router.push(`/app/chat?finding=${selectedFinding.id}`)}
					/>
				)}
			</SideDrawer>
		</>
	);
}

// ──────────────────────────────────────────────
// Preflight Checklist
// ──────────────────────────────────────────────

type PreflightReadiness = "ready" | "ready_with_risks" | "blocker";

function computePreflightReadiness(findings: FindingProjection[]): PreflightReadiness {
	const hasBlocker = findings.some((f) => f.polarity === "negative" && (f.severity === "critical" || f.severity === "high"));
	if (hasBlocker) return "blocker";
	const hasWarning = findings.some((f) => f.polarity === "negative" && (f.severity === "medium" || f.severity === "low"));
	if (hasWarning) return "ready_with_risks";
	return "ready";
}

const readinessConfig: Record<PreflightReadiness, { icon: string; color: string; bg: string }> = {
	ready: { icon: "\u2713", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 border-emerald-500/30 dark:bg-emerald-500/10" },
	ready_with_risks: { icon: "\u26A0", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 border-amber-500/30 dark:bg-amber-500/10" },
	blocker: { icon: "\u2717", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 border-red-500/30 dark:bg-red-500/10" },
};

function PreflightChecklist({
	findings,
	readiness,
	onFindingClick,
}: {
	findings: FindingProjection[];
	readiness: PreflightReadiness;
	onFindingClick: (f: FindingProjection) => void;
}) {
	const t = useTranslations("console.workspaces");
	const rc = readinessConfig[readiness];

	return (
		<div className="space-y-3">
			<div className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[12px] font-semibold ${rc.bg} ${rc.color}`}>
				<span>{rc.icon}</span>
				{t(`detail.readiness.${readiness}`)}
			</div>
			<div className="space-y-1">
				{findings.map((f) => {
					const isPass = f.polarity === "positive";
					const isFail = f.polarity === "negative" && (f.severity === "high" || f.severity === "critical");
					const icon = isPass ? "\u2713" : isFail ? "\u2717" : "\u26A0";
					const iconColor = isPass ? "text-emerald-500" : isFail ? "text-red-500" : "text-amber-500";
					const textColor = isPass ? "text-zinc-600 dark:text-zinc-300" : isFail ? "text-red-700 dark:text-red-300/90" : "text-amber-700 dark:text-amber-300/90";

					return (
						<button
							key={f.id}
							onClick={() => onFindingClick(f)}
							className="flex w-full items-start gap-3 rounded-xl border border-edge bg-surface-card px-4 py-2.5 text-left transition-colors hover:bg-surface-card-hover"
						>
							<span className={`mt-0.5 text-[12px] font-bold ${iconColor}`}>{icon}</span>
							<div className="min-w-0 flex-1">
								<div className={`text-[13px] font-medium ${textColor}`}>{f.title}</div>
								<div className="mt-1 flex flex-wrap items-center gap-1.5">
									<SeverityBadge value={f.severity} />
									<VerificationBadge value={f.verification_maturity} />
									{f.change_class && <ChangeBadge value={f.change_class} />}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Finding Drawer
// ──────────────────────────────────────────────

function FindingDrawerContent({ finding, onDiscuss }: { finding: FindingProjection; onDiscuss: () => void }) {
	const td = useTranslations("console.finding_drawer");
	const tc = useTranslations("console.common");

	return (
		<div className="space-y-6">
			<section>
				<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">{td("summary")}</h3>
				<p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{finding.cause}</p>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{finding.polarity === "positive" ? (
						<span className="rounded-sm bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">{tc("healthy")}</span>
					) : (
						<SeverityBadge value={finding.severity} />
					)}
					<VerificationBadge value={finding.verification_maturity} />
					{finding.change_class && <ChangeBadge value={finding.change_class} />}
					<span className="rounded-sm border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-white/[0.06]">
						{tc(`pack_labels.${finding.pack}`)}
					</span>
					{finding.surface && (
						<code className="rounded-sm border border-zinc-200 px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-zinc-500 dark:border-white/[0.06]">
							{finding.surface}
						</code>
					)}
				</div>
			</section>

			{finding.suppression_context?.is_suppressed && (
				<section>
					<div className="rounded border-l-2 border-l-amber-500/60 bg-amber-50 px-4 py-3 dark:bg-amber-500/[0.04]">
						<div className="mb-1 flex items-center gap-2">
							<span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{td("suppressed")}</span>
						</div>
						<p className="text-[11px] text-amber-700 dark:text-amber-300/80">{finding.suppression_context.explanation}</p>
					</div>
				</section>
			)}

			{finding.effect && (
				<section>
					<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">{td("effect")}</h3>
					<p className="text-[13px] text-zinc-500">{finding.effect}</p>
				</section>
			)}

			{finding.root_cause && (
				<section>
					<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">{td("root_cause")}</h3>
					<div className="rounded-xl border border-edge bg-surface-card px-4 py-2.5">
						<span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{finding.root_cause}</span>
					</div>
				</section>
			)}

			{finding.polarity !== "positive" && (
				<section>
					<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">{td("impact_breakdown")}</h3>
					<div className="space-y-1.5">
						<div className="flex items-center justify-between rounded-xl border border-edge bg-surface-card/50 px-4 py-2">
							<span className="text-[11px] text-zinc-500">{td("monthly_range")}</span>
							<ImpactBadge min={finding.impact.monthly_range.min} max={finding.impact.monthly_range.max} />
						</div>
						<div className="flex items-center justify-between rounded-xl border border-edge bg-surface-card/50 px-4 py-2">
							<span className="text-[11px] text-zinc-500">{td("midpoint")}</span>
							<ImpactBadge min={finding.impact.midpoint} max={finding.impact.midpoint} compact />
						</div>
						<div className="flex items-center justify-between rounded-xl border border-edge bg-surface-card/50 px-4 py-2">
							<span className="text-[11px] text-zinc-500">{td("impact_type")}</span>
							<span className="text-[11px] text-zinc-600 dark:text-zinc-400">{tc(`impact_types.${finding.impact.impact_type}`)}</span>
						</div>
					</div>
				</section>
			)}

			{finding.evidence_quality && (
				<section>
					<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">{td("evidence_quality")}</h3>
					<div className="space-y-2 rounded-xl border border-edge bg-surface-card/50 px-4 py-3">
						<EvidenceQualityBar label={td("source_reliability")} value={finding.evidence_quality.source_reliability} />
						<EvidenceQualityBar label={td("completeness")} value={finding.evidence_quality.completeness} />
						<EvidenceQualityBar label={td("recency")} value={finding.evidence_quality.recency} />
						<EvidenceQualityBar label={td("corroboration")} value={finding.evidence_quality.corroboration} />
					</div>
				</section>
			)}

			<section>
				<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">{td("verification")}</h3>
				<VerificationPanel
					maturity={finding.verification_maturity}
					method={finding.verification_method}
					verifiedAt={null}
					expiresAt={null}
					reTriggerReason={null}
					decisionStatus={null}
					onRequestVerification={() => toast.success(td("verification_requested"))}
				/>
			</section>

			<VerificationSufficiencyWarning severity={finding.severity} maturity={finding.verification_maturity} />

			<section>
				<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{finding.polarity === "positive" ? td("why_good") : td("reasoning")}
				</h3>
				<p className="text-[13px] leading-relaxed text-zinc-500">{finding.reasoning}</p>
			</section>

			{finding.truth_context?.has_contradictions && (
				<section>
					<div className="rounded border-l-2 border-l-amber-500/60 bg-amber-50 px-4 py-3 dark:bg-amber-500/[0.04]">
						<p className="text-[11px] text-amber-700 dark:text-amber-300">
							{td("contradictions_detected", { count: finding.truth_context.contradiction_count })}
						</p>
					</div>
				</section>
			)}

			{finding.polarity !== "positive" && (
				<section>
					<button
						onClick={onDiscuss}
						className="w-full rounded border border-emerald-500/30 bg-emerald-50 px-4 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/[0.06] dark:text-emerald-400 dark:hover:bg-emerald-500/[0.1]"
					>
						{td("discuss_finding")}
					</button>
				</section>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function WorkspaceChangeTrend({ summary }: { summary: WorkspaceProjection["change_summary"] }) {
	const t = useTranslations("console.workspaces");
	if (!summary) return null;

	const config: Record<string, { icon: string; color: string; label: string }> = {
		degrading: { icon: "\u2191", color: "text-red-500 dark:text-red-400", label: t("detail.trend.regressions", { count: summary.regression_count }) },
		improving: { icon: "\u2193", color: "text-emerald-600 dark:text-emerald-400", label: t("detail.trend.improvements", { count: summary.improvement_count }) },
		stable: { icon: "\u2014", color: "text-zinc-400 dark:text-zinc-500", label: t("detail.trend.stable") },
		mixed: { icon: "\u2195", color: "text-amber-500 dark:text-amber-400", label: t("detail.trend.mixed") },
	};

	const c = config[summary.trend] || config.stable;
	return (
		<span className={`inline-flex items-center gap-1 font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-medium ${c.color}`}>
			<span>{c.icon}</span>{c.label}
		</span>
	);
}

function TrendHeadline({ summary }: { summary: NonNullable<WorkspaceProjection["change_summary"]> }) {
	const t = useTranslations("console.workspaces");
	return (
		<div className="flex flex-wrap items-center gap-3 font-[family-name:var(--font-jetbrains-mono)] text-[12px]">
			{summary.regression_count > 0 && <span className="text-red-500 dark:text-red-400">{t("detail.trend.regressions", { count: summary.regression_count })}</span>}
			{summary.improvement_count > 0 && <span className="text-emerald-600 dark:text-emerald-400">{t("detail.trend.improvements", { count: summary.improvement_count })}</span>}
			{summary.resolved_count > 0 && <span className="text-emerald-600 dark:text-emerald-400">{t("detail.trend.resolved", { count: summary.resolved_count })}</span>}
			{summary.regression_count === 0 && summary.improvement_count === 0 && summary.resolved_count === 0 && (
				<span className="text-zinc-400 dark:text-zinc-600">{t("detail.trend.no_significant_changes")}</span>
			)}
		</div>
	);
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
	return (
		<div className="rounded-xl border border-edge bg-surface-card/50 px-3 py-2.5">
			<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
				{label}
			</div>
			<div className={`mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[16px] font-bold tabular-nums ${color}`}>
				{typeof value === "string" ? value.replace(/_/g, " ") : value}
			</div>
		</div>
	);
}

function EvidenceQualityBar({ label, value }: { label: string; value: number }) {
	const barColor = value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
	return (
		<div className="flex items-center gap-3">
			<span className="w-28 shrink-0 text-[11px] text-zinc-500">{label}</span>
			<div className="h-[3px] flex-1 rounded-sm bg-zinc-200 dark:bg-white/[0.04]">
				<div className={`h-full rounded-sm transition-all ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
			</div>
			<span className="w-6 text-right font-[family-name:var(--font-jetbrains-mono)] text-[10px] tabular-nums text-zinc-500">{value}</span>
		</div>
	);
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };

function getTopSeverity(findings: FindingProjection[]): string {
	if (findings.length === 0) return "none";
	let top = "none";
	let topRank = -1;
	for (const f of findings) {
		const rank = SEVERITY_RANK[f.severity] ?? 0;
		if (rank > topRank) { topRank = rank; top = f.severity; }
	}
	return top;
}
