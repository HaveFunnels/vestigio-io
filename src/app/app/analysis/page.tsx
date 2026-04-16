"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import {
	DrawerSection,
	DrawerStatBox,
	DrawerStatRow,
} from "@/components/console/DrawerSection";
import { loadFindings } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { FindingProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Analysis Page — Live Progressive Analysis
//
// - SSE stream for real-time updates
// - Step timeline with human-language messages
// - Progressive finding delivery
// - Polarity filtering (negative/positive/neutral)
// ──────────────────────────────────────────────

type AnalysisState = "idle" | "ongoing" | "complete";
type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";
type PackFilter =
	| "all"
	| "scale_readiness"
	| "revenue_integrity"
	| "chargeback_resilience"
	| "saas_growth_readiness";
type PolarityFilter = "all" | "negative" | "positive" | "neutral";
type VerificationFilter = "all" | "unverified" | "verified" | "challenged";
type ImpactRangeFilter = "all" | "lt1k" | "1k_10k" | "10k_50k" | "gt50k";
type ChangeClassFilter =
	| "all"
	| "new_issue"
	| "regression"
	| "improvement"
	| "stable_risk"
	| "resolved";

const severityValues: SeverityFilter[] = [
	"all",
	"critical",
	"high",
	"medium",
	"low",
];
const packValues: PackFilter[] = [
	"all",
	"scale_readiness",
	"revenue_integrity",
	"chargeback_resilience",
	"saas_growth_readiness",
];
const polarityValues: PolarityFilter[] = [
	"all",
	"negative",
	"positive",
	"neutral",
];
const verificationValues: VerificationFilter[] = [
	"all",
	"unverified",
	"verified",
	"challenged",
];
const impactRangeValues: ImpactRangeFilter[] = [
	"all",
	"lt1k",
	"1k_10k",
	"10k_50k",
	"gt50k",
];
const changeClassValues: ChangeClassFilter[] = [
	"all",
	"new_issue",
	"regression",
	"improvement",
	"stable_risk",
	"resolved",
];

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

export default function AnalysisPage() {
	const t = useTranslations("console.analysis");
	const tTooltip = useTranslations("console.common");
	const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
	const [currentStep, setCurrentStep] = useState<string | null>(null);
	const [findings, setFindings] = useState<FindingProjection[]>([]);
	const [stepHistory, setStepHistory] = useState<string[]>([]);
	const [coverageScore, setCoverageScore] = useState<number>(0);
	const [totalImpact, setTotalImpact] = useState<number>(0);
	const [challengeInfo, setChallengeInfo] = useState<{
		type: string;
		url: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Try pre-loaded data from server layout, fall back to direct MCP call
	const mcpData = useMcpData();
	const existingState =
		mcpData.findings.status !== "not_ready" ? mcpData.findings : loadFindings();
	const hasExistingData =
		existingState.status === "ready" && existingState.data.length > 0;

	useEffect(() => {
		if (hasExistingData && existingState.status === "ready") {
			setFindings(existingState.data);
			setAnalysisState("complete");
		}
	}, [hasExistingData]);

	const startAnalysis = useCallback(
		(domain: string) => {
			setAnalysisState("ongoing");
			setFindings([]);
			setStepHistory([]);
			setError(null);

			const params = new URLSearchParams({ domain });
			const evtSource = new EventSource(`/api/analysis/stream?${params}`);

			evtSource.addEventListener("step", (e) => {
				const data = JSON.parse(e.data);
				setCurrentStep(data.message);
				setStepHistory((prev) => [...prev.slice(-6), data.message]);
			});

			evtSource.addEventListener("findings", (e) => {
				const data = JSON.parse(e.data);
				setFindings(data.findings);
			});

			evtSource.addEventListener("score", (e) => {
				const data = JSON.parse(e.data);
				setTotalImpact(data.total_impact_mid);
				setCoverageScore(data.coverage?.score || 0);
			});

			evtSource.addEventListener("challenge_detected", (e) => {
				const data = JSON.parse(e.data);
				setChallengeInfo({ type: data.challenge_type, url: data.url });
			});

			evtSource.addEventListener("coverage_update", (e) => {
				const data = JSON.parse(e.data);
				setCoverageScore(data.score || 0);
			});

			evtSource.addEventListener("complete", () => {
				setAnalysisState("complete");
				evtSource.close();
			});

			evtSource.addEventListener("error", (e) => {
				try {
					const data = JSON.parse((e as any).data);
					setError(data.message);
				} catch {
					setError(t("connection_lost"));
				}
				setAnalysisState("complete");
				evtSource.close();
			});

			evtSource.onerror = () => {
				setAnalysisState("complete");
				evtSource.close();
			};
		},
		[t]
	);

	// If no existing data and idle, show prompt or auto-start
	if (analysisState === "idle" && !hasExistingData) {
		if (existingState.status === "not_ready") {
			return (
				<div className='p-4 sm:p-6'>
					<ConsoleState state={existingState} loadingLabel='' emptyLabel=''>
						{() => null}
					</ConsoleState>
				</div>
			);
		}
		// Show empty state with existing ConsoleState handling
		return (
			<div className='p-4 sm:p-6'>
				<ConsoleState
					state={existingState}
					loadingLabel={t("loading")}
					emptyLabel={t("empty")}
				>
					{(data) => (
						<AnalysisContent
							findings={data}
							analysisState='complete'
							currentStep={null}
							stepHistory={[]}
							coverageScore={100}
							challengeInfo={null}
						/>
					)}
				</ConsoleState>
			</div>
		);
	}

	return (
		<div className='p-4 sm:p-6'>
			<PageHeader
				title={t("title")}
				subtitle={
					analysisState === "ongoing"
						? t("subtitle_ongoing")
						: t("subtitle_complete")
				}
				tooltip={tTooltip("page_tooltips.analysis")}
			/>

			{/* Step Timeline (during ongoing analysis) */}
			{analysisState === "ongoing" && currentStep && (
				<div className='mb-6 rounded-lg border border-edge bg-surface-card p-4'>
					<div className='flex items-center gap-3'>
						<div className='h-3 w-3 animate-pulse rounded-full bg-emerald-500' />
						<span className='text-sm font-medium text-content-secondary'>
							{currentStep}
						</span>
					</div>
					{stepHistory.length > 1 && (
						<div className='mt-3 space-y-1'>
							{stepHistory.slice(0, -1).map((step, i) => (
								<div key={i} className='flex items-center gap-3 pl-1'>
									<div className='h-1.5 w-1.5 rounded-full bg-surface-inset' />
									<span className='text-xs text-content-faint'>{step}</span>
								</div>
							))}
						</div>
					)}
					{coverageScore > 0 && (
						<div className='mt-3 flex items-center gap-2'>
							<div className='h-1.5 flex-1 rounded-full bg-surface-inset'>
								<div
									className='h-1.5 rounded-full bg-emerald-600 transition-all duration-500'
									style={{ width: `${coverageScore}%` }}
								/>
							</div>
							<span className='text-xs text-content-muted'>
								{t("coverage", { score: coverageScore })}
							</span>
						</div>
					)}
				</div>
			)}

			{/* Challenge Warning */}
			{challengeInfo && (
				<div className='mb-4 rounded-lg border border-amber-900/50 bg-amber-500/5 px-4 py-3'>
					<div className='flex items-center gap-2'>
						<span className='text-amber-500'>&#9888;</span>
						<span className='text-sm font-medium text-amber-600 dark:text-amber-300'>
							{t("protection_detected", { type: challengeInfo.type })}
						</span>
					</div>
					<p className='mt-1 text-xs text-amber-600/70 dark:text-amber-400/70'>
						{t("protection_description", { url: challengeInfo.url })}
					</p>
				</div>
			)}

			{error && (
				<div className='mb-4 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400'>
					{error}
				</div>
			)}

			{/* Skeleton during loading */}
			{analysisState === "ongoing" && findings.length === 0 && (
				<div className='space-y-3'>
					{[...Array(5)].map((_, i) => (
						<div
							key={i}
							className='flex items-center gap-4 rounded-lg border border-edge bg-surface-card/30 p-4'
						>
							<div className='h-4 w-4 animate-pulse rounded bg-surface-inset' />
							<div className='flex-1 space-y-2'>
								<div className='h-3 w-3/4 animate-pulse rounded bg-surface-inset' />
								<div className='h-2 w-1/2 animate-pulse rounded bg-surface-inset' />
							</div>
							<div className='h-6 w-16 animate-pulse rounded bg-surface-inset' />
						</div>
					))}
				</div>
			)}

			{/* Real findings content */}
			{findings.length > 0 && (
				<AnalysisContent
					findings={findings}
					analysisState={analysisState}
					currentStep={currentStep}
					stepHistory={stepHistory}
					coverageScore={coverageScore}
					challengeInfo={challengeInfo}
				/>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Content (renders incrementally)
// ──────────────────────────────────────────────

function AnalysisContent({
	findings,
	analysisState,
	currentStep,
	stepHistory,
	coverageScore,
	challengeInfo,
}: {
	findings: FindingProjection[];
	analysisState: AnalysisState;
	currentStep: string | null;
	stepHistory: string[];
	coverageScore: number;
	challengeInfo: { type: string; url: string } | null;
}) {
	const router = useRouter();
	const t = useTranslations("console.analysis");
	const tc = useTranslations("console.common");
	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
	const [packFilter, setPackFilter] = useState<PackFilter>("all");
	const [polarityFilter, setPolarityFilter] = useState<PolarityFilter>("all");
	const [verificationFilter, setVerificationFilter] =
		useState<VerificationFilter>("all");
	const [impactRangeFilter, setImpactRangeFilter] =
		useState<ImpactRangeFilter>("all");
	const [surfaceFilter, setSurfaceFilter] = useState<string>("all");
	const [changeClassFilter, setChangeClassFilter] =
		useState<ChangeClassFilter>("all");
	const [searchText, setSearchText] = useState("");
	const [hidePositive, setHidePositive] = useState(false);
	const [selectedFinding, setSelectedFinding] =
		useState<FindingProjection | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const severityLabels: Record<SeverityFilter, string> = {
		all: tc("severity.all"),
		critical: tc("severity.critical"),
		high: tc("severity.high"),
		medium: tc("severity.medium"),
		low: tc("severity.low"),
	};

	const packOptionLabels: Record<PackFilter, string> = {
		all: tc("packs.all"),
		scale_readiness: tc("packs.scale_readiness"),
		revenue_integrity: tc("packs.revenue_integrity"),
		chargeback_resilience: tc("packs.chargeback_resilience"),
		saas_growth_readiness: tc("packs.saas_growth_readiness"),
	};

	const polarityLabels: Record<PolarityFilter, string> = {
		all: tc("polarity.all"),
		negative: tc("polarity.negative"),
		positive: tc("polarity.positive"),
		neutral: tc("polarity.neutral"),
	};

	const verificationLabels: Record<VerificationFilter, string> = {
		all: t("filters.verification.all"),
		unverified: t("filters.verification.unverified"),
		verified: t("filters.verification.verified"),
		challenged: t("filters.verification.challenged"),
	};

	const impactRangeLabels: Record<ImpactRangeFilter, string> = {
		all: t("filters.impact_range.all"),
		lt1k: t("filters.impact_range.lt1k"),
		"1k_10k": t("filters.impact_range.1k_10k"),
		"10k_50k": t("filters.impact_range.10k_50k"),
		gt50k: t("filters.impact_range.gt50k"),
	};

	const changeClassLabels: Record<ChangeClassFilter, string> = {
		all: t("filters.change_class.all"),
		new_issue: t("filters.change_class.new_issue"),
		regression: t("filters.change_class.regression"),
		improvement: t("filters.change_class.improvement"),
		stable_risk: t("filters.change_class.stable_risk"),
		resolved: t("filters.change_class.resolved"),
	};

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

	const surfaceOptions = useMemo(() => {
		const unique = Array.from(
			new Set(findings.map((f) => f.surface).filter(Boolean))
		).sort();
		return [
			{ label: t("filters.surfaces.all"), value: "all" },
			...unique.map((s) => ({ label: s!, value: s! })),
		];
	}, [findings, t]);

	const filtered = useMemo(() => {
		return findings.filter((f) => {
			// Phase 0 UX: Hide suppressed findings with 'hidden' visibility
			if (f.suppression_context?.visibility === "hidden") return false;
			if (severityFilter !== "all" && f.severity !== severityFilter)
				return false;
			if (packFilter !== "all" && f.pack !== packFilter) return false;
			if (polarityFilter !== "all" && f.polarity !== polarityFilter)
				return false;
			if (hidePositive && f.polarity === "positive") return false;
			if (verificationFilter !== "all") {
				// Wave 2.4 vocabulary: static_evidence is the new "no browser
				// corroboration yet"; confirmed is the new "verified"; the
				// re-check bucket combines evidence_weakened + confirmation_expired.
				if (
					verificationFilter === "unverified" &&
					f.verification_maturity !== "static_evidence" &&
					f.verification_maturity !== null
				)
					return false;
				if (
					verificationFilter === "verified" &&
					f.verification_maturity !== "confirmed"
				)
					return false;
				if (
					verificationFilter === "challenged" &&
					f.verification_maturity !== "evidence_weakened" &&
					f.verification_maturity !== "confirmation_expired"
				)
					return false;
			}
			if (impactRangeFilter !== "all") {
				const mid = f.impact.midpoint;
				if (impactRangeFilter === "lt1k" && mid >= 1000) return false;
				if (impactRangeFilter === "1k_10k" && (mid < 1000 || mid >= 10000))
					return false;
				if (impactRangeFilter === "10k_50k" && (mid < 10000 || mid >= 50000))
					return false;
				if (impactRangeFilter === "gt50k" && mid < 50000) return false;
			}
			if (surfaceFilter !== "all" && f.surface !== surfaceFilter) return false;
			if (changeClassFilter !== "all" && f.change_class !== changeClassFilter)
				return false;
			if (searchText) {
				const q = searchText.toLowerCase();
				if (
					!(
						f.title?.toLowerCase().includes(q) ||
						f.root_cause?.toLowerCase().includes(q)
					)
				)
					return false;
			}
			return true;
		});
	}, [
		findings,
		severityFilter,
		packFilter,
		polarityFilter,
		hidePositive,
		verificationFilter,
		impactRangeFilter,
		surfaceFilter,
		changeClassFilter,
		searchText,
	]);

	const summaryCards: SummaryCard[] = useMemo(() => {
		const negativeFindings = findings.filter((f) => f.polarity === "negative");
		const positiveFindings = findings.filter((f) => f.polarity === "positive");
		const totalImpactMid = negativeFindings.reduce(
			(sum, f) => sum + f.impact.midpoint,
			0
		);
		const highImpact = negativeFindings.filter(
			(f) => f.impact.midpoint >= 10000
		).length;
		return [
			{
				label: t("cards.findings"),
				value: t("cards.findings_value", {
					issues: negativeFindings.length,
					strengths: positiveFindings.length,
				}),
				subtext: analysisState === "ongoing" ? t("updating") : undefined,
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
				// Negative-number rule: monthly impact = ongoing loss until
				// findings are remediated. Apply only when there's actual
				// exposure so a clean state (`$0`) doesn't read as `−$0`.
				negative: totalImpactMid > 0,
				subtext: t("cards.per_month_midpoint"),
			},
			{
				label: t("cards.high_impact_issues"),
				value: highImpact,
				variant: "danger",
				subtext: t("cards.high_impact_threshold"),
			},
			{
				label: t("cards.verified_findings"),
				value: `${findings.filter((f) => f.verification_maturity === "confirmed").length}/${findings.filter((f) => f.polarity === "negative").length}`,
				variant: "info",
			},
		];
	}, [findings, analysisState, t]);

	const toggleSelect = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const columns: Column<FindingProjection>[] = [
		{
			key: "select",
			label: "",
			className: "w-8",
			render: (row) => (
				<input
					type='checkbox'
					checked={selectedIds.has(row.id)}
					onChange={() => {}}
					onClick={(e) => toggleSelect(row.id, e)}
					className='h-3.5 w-3.5 cursor-pointer rounded border-edge bg-surface-inset text-emerald-500 focus:ring-0'
				/>
			),
		},
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
			render: (row) => {
				const isDimmed = row.suppression_context?.visibility === "dimmed";
				const isAnnotated = row.suppression_context?.visibility === "annotated";
				return (
					<div className={isDimmed ? "opacity-50" : ""}>
						<div className='flex items-center gap-2'>
							<span
								className={`text-sm ${row.polarity === "positive" ? "text-emerald-600 dark:text-emerald-300" : "text-content-secondary"}`}
							>
								{row.title}
							</span>
							{isAnnotated && (
								<span className='rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400'>
									{t("suppressed")}
								</span>
							)}
						</div>
						{row.root_cause && (
							<div className='mt-0.5 text-xs text-content-muted'>
								{row.root_cause}
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "severity",
			label: tc("columns.severity"),
			className: "w-24",
			render: (row) =>
				row.polarity === "positive" ? (
					<span className='rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400'>
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
					<span className='font-mono text-xs text-emerald-600 dark:text-emerald-400'>
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
			key: "impact_type",
			label: tc("columns.type"),
			className: "w-28",
			render: (row) => (
				<span className='text-xs text-content-muted'>
					{impactTypeLabels[row.impact.impact_type] || row.impact.impact_type}
				</span>
			),
		},
		{
			key: "pack",
			label: tc("columns.pack"),
			className: "w-20",
			render: (row) => (
				<span className='rounded border border-edge px-2 py-0.5 text-xs text-content-muted'>
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
					<button
						onClick={(e) => {
							e.stopPropagation();
							router.push(`/chat?finding=${row.id}`);
						}}
						className='rounded border border-edge px-2 py-1 text-xs text-content-muted transition-colors hover:border-emerald-600 hover:text-emerald-400'
					>
						{t("discuss")}
					</button>
				) : null,
		},
	];

	return (
		<>
			<div className='mb-6'>
				<SummaryCards cards={summaryCards} />
			</div>

			<div className='mb-4 flex flex-wrap items-center gap-3'>
				<select
					value={polarityFilter}
					onChange={(e) => setPolarityFilter(e.target.value as PolarityFilter)}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{polarityValues.map((v) => (
						<option key={v} value={v}>
							{polarityLabels[v]}
						</option>
					))}
				</select>
				<select
					value={severityFilter}
					onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{severityValues.map((v) => (
						<option key={v} value={v}>
							{severityLabels[v]}
						</option>
					))}
				</select>
				<select
					value={packFilter}
					onChange={(e) => setPackFilter(e.target.value as PackFilter)}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{packValues.map((v) => (
						<option key={v} value={v}>
							{packOptionLabels[v]}
						</option>
					))}
				</select>
				<select
					value={verificationFilter}
					onChange={(e) =>
						setVerificationFilter(e.target.value as VerificationFilter)
					}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{verificationValues.map((v) => (
						<option key={v} value={v}>
							{verificationLabels[v]}
						</option>
					))}
				</select>
				<select
					value={changeClassFilter}
					onChange={(e) =>
						setChangeClassFilter(e.target.value as ChangeClassFilter)
					}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{changeClassValues.map((v) => (
						<option key={v} value={v}>
							{changeClassLabels[v]}
						</option>
					))}
				</select>
				<select
					value={impactRangeFilter}
					onChange={(e) =>
						setImpactRangeFilter(e.target.value as ImpactRangeFilter)
					}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{impactRangeValues.map((v) => (
						<option key={v} value={v}>
							{impactRangeLabels[v]}
						</option>
					))}
				</select>
				<select
					value={surfaceFilter}
					onChange={(e) => setSurfaceFilter(e.target.value)}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				>
					{surfaceOptions.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
				<input
					type='text'
					value={searchText}
					onChange={(e) => setSearchText(e.target.value)}
					placeholder={t("search_placeholder")}
					className='whitespace-nowrap rounded-md border border-edge bg-surface-card py-1.5 pl-2.5 pr-6 text-xs text-content-secondary focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
				/>

				<label className='flex cursor-pointer items-center gap-1.5 text-xs text-content-muted'>
					<input
						type='checkbox'
						checked={hidePositive}
						onChange={(e) => setHidePositive(e.target.checked)}
						className='h-3 w-3 rounded border-edge bg-surface-inset text-emerald-500 focus:ring-0'
					/>
					{tc("hide_positive_signals")}
				</label>

				{(severityFilter !== "all" ||
					packFilter !== "all" ||
					polarityFilter !== "all" ||
					verificationFilter !== "all" ||
					impactRangeFilter !== "all" ||
					surfaceFilter !== "all" ||
					changeClassFilter !== "all" ||
					searchText !== "") && (
					<button
						onClick={() => {
							setSeverityFilter("all");
							setPackFilter("all");
							setPolarityFilter("all");
							setVerificationFilter("all");
							setImpactRangeFilter("all");
							setSurfaceFilter("all");
							setChangeClassFilter("all");
							setSearchText("");
						}}
						className='rounded-md px-3 py-1.5 text-xs text-content-muted transition-colors hover:text-content-secondary'
					>
						{tc("clear_filters")}
					</button>
				)}
				<span className='ml-auto text-xs text-content-muted'>
					{tc("n_of_total", {
						filtered: filtered.length,
						total: findings.length,
					})}
				</span>
			</div>

			{/* Selection bar — matches inventory pattern */}
			{selectedIds.size > 0 && (
				<div className='sticky top-0 z-30 mb-2 flex items-center gap-4 rounded-lg border border-edge bg-surface-card px-4 py-2.5 shadow-lg'>
					<span className='text-sm font-medium text-content'>
						{selectedIds.size} {t("selected")}
					</span>
					<div className='flex-1' />
					<ShinyButton
						variant="console"
						onClick={() =>
							router.push(`/app/chat?findings=${[...selectedIds].join(",")}`)
						}
					>
						{selectedIds.size === 1
							? t("discuss")
							: t("analyze_together", { count: selectedIds.size })}
					</ShinyButton>
					<button
						onClick={() => setSelectedIds(new Set())}
						className='rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover'
					>
						{tc("clear_filters")}
					</button>
				</div>
			)}

			<DataTable
				columns={columns}
				data={filtered}
				onRowClick={(row) => setSelectedFinding(row)}
				getRowKey={(row) => row.id}
				emptyMessage={t("no_match")}
			/>

			<SideDrawer
				open={selectedFinding !== null}
				onClose={() => setSelectedFinding(null)}
				title={selectedFinding?.title || ""}
			>
				{selectedFinding && (
					<FindingDrawerContent
						finding={selectedFinding}
						onDiscuss={() => router.push(`/chat?finding=${selectedFinding.id}`)}
					/>
				)}
			</SideDrawer>
		</>
	);
}

function FindingDrawerContent({
	finding,
	onDiscuss,
}: {
	finding: FindingProjection;
	onDiscuss: () => void;
}) {
	const td = useTranslations("console.finding_drawer");
	const tc = useTranslations("console.common");
	const router = useRouter();
	const [kbLink, setKbLink] = useState<{
		slug: string;
		title: string;
		excerpt?: string;
	} | null>(null);

	useEffect(() => {
		if (!finding.inference_key) return;
		fetch(
			`/api/knowledge-base/by-finding-key?key=${encodeURIComponent(finding.inference_key)}`
		)
			.then((r) => r.json())
			.then((data) => {
				if (data.article) setKbLink(data.article);
			})
			.catch(() => {});
	}, [finding.inference_key]);

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

	// Severity drives the accent color of the impact-related sections
	const severityAccent: "danger" | "warning" | "default" =
		finding.polarity === "positive"
			? "default"
			: finding.severity === "critical" || finding.severity === "high"
				? "danger"
				: finding.severity === "medium"
					? "warning"
					: "default";

	return (
		<div className='space-y-5'>
			{/* Summary + badges */}
			<DrawerSection title={td("summary")} accent={severityAccent}>
				<p className='text-sm text-content-secondary'>{finding.cause}</p>
				<div className='mt-2 flex flex-wrap items-center gap-2'>
					{finding.polarity === "positive" ? (
						<span className='rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400'>
							{tc("healthy")}
						</span>
					) : (
						<SeverityBadge value={finding.severity} />
					)}
					<VerificationBadge value={finding.verification_maturity} />
					{finding.change_class && <ChangeBadge value={finding.change_class} />}
					<PackBadge
						pack={finding.pack}
						label={packLabels[finding.pack] || finding.pack}
					/>
					{finding.surface && (
						<code className='rounded border border-edge px-2 py-0.5 text-xs text-content-muted'>
							{finding.surface}
						</code>
					)}
				</div>
			</DrawerSection>

			{/* Suppression Callout */}
			{finding.suppression_context &&
				finding.suppression_context.is_suppressed && (
					<DrawerStatBox accent='warning'>
						<div className='px-4 py-3'>
							<div className='mb-1 flex items-center gap-2'>
								<span className='text-xs font-semibold text-amber-600 dark:text-amber-500'>
									{td("suppressed")}
								</span>
								<span className='rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400'>
									{finding.suppression_context.visibility}
								</span>
							</div>
							<p className='text-xs text-amber-600/80 dark:text-amber-300/80'>
								{finding.suppression_context.explanation}
							</p>
						</div>
					</DrawerStatBox>
				)}

			{/* Effect */}
			{finding.effect && (
				<DrawerSection title={td("effect")}>
					<p className='text-sm text-content-muted'>{finding.effect}</p>
				</DrawerSection>
			)}

			{/* Root Cause */}
			{finding.root_cause && (
				<DrawerSection title={td("root_cause")}>
					<DrawerStatBox>
						<div className='px-4 py-3'>
							<span className='text-sm font-medium text-content-secondary'>
								{finding.root_cause}
							</span>
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Remediation Steps + Estimated Effort
			    Phase 3: structured fix recipe populated from the catalog
			    (packages/projections/remediation-catalog.ts). Null means
			    the inference_key hasn't been authored yet — we render a
			    placeholder so operators see work-in-progress instead of
			    an empty drawer. */}
			{finding.polarity !== "positive" && (
				<DrawerSection title={td("remediation")} accent={severityAccent}>
					<DrawerStatBox accent={severityAccent}>
						{finding.remediation_steps && finding.remediation_steps.length > 0 ? (
							<ol className='list-none space-y-2 px-4 py-3'>
								{finding.remediation_steps.map((step, i) => (
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
						) : (
							<div className='px-4 py-3 text-sm text-content-faint italic'>
								{td("remediation_empty")}
							</div>
						)}
						{finding.estimated_effort_hours != null && (
							<div className='border-t border-edge/50 px-4 py-2.5'>
								<div className='flex items-center justify-between text-xs'>
									<span className='uppercase tracking-wider text-content-faint'>
										{td("estimated_effort")}
									</span>
									<span className='font-mono font-medium text-content-secondary'>
										{td("estimated_effort_hours", {
											hours: finding.estimated_effort_hours,
										})}
									</span>
								</div>
							</div>
						)}
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Impact Breakdown */}
			{finding.polarity !== "positive" && (
				<DrawerSection title={td("impact_breakdown")} accent={severityAccent}>
					<DrawerStatBox accent={severityAccent}>
						<DrawerStatRow
							label={td("monthly_range")}
							value={
								<ImpactBadge
									min={finding.impact.monthly_range.min}
									max={finding.impact.monthly_range.max}
								/>
							}
						/>
						<DrawerStatRow
							label={td("midpoint")}
							value={
								<ImpactBadge
									min={finding.impact.midpoint}
									max={finding.impact.midpoint}
									compact
								/>
							}
						/>
						<DrawerStatRow
							label={td("impact_type")}
							value={
								impactTypeLabels[finding.impact.impact_type] ||
								finding.impact.impact_type
							}
						/>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Evidence Quality */}
			{finding.evidence_quality && (
				<DrawerSection title={td("evidence_quality")} accent='info'>
					<DrawerStatBox accent='info'>
						<div className='space-y-2 px-4 py-3'>
							<EvidenceQualityBar
								label={td("source_reliability")}
								value={finding.evidence_quality.source_reliability}
							/>
							<EvidenceQualityBar
								label={td("completeness")}
								value={finding.evidence_quality.completeness}
							/>
							<EvidenceQualityBar
								label={td("recency")}
								value={finding.evidence_quality.recency}
							/>
							<EvidenceQualityBar
								label={td("corroboration")}
								value={finding.evidence_quality.corroboration}
							/>
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Verification Lifecycle Panel */}
			<DrawerSection
				title={td("verification")}
				accent='info'
				titleSlot={<InfoTooltip text={td("verification_tooltip")} />}
			>
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
			</DrawerSection>

			{/* Verification Sufficiency Warning */}
			<VerificationSufficiencyWarning
				severity={finding.severity}
				maturity={finding.verification_maturity}
			/>

			{/* Reasoning */}
			<DrawerSection
				title={
					finding.polarity === "positive" ? td("why_good") : td("reasoning")
				}
			>
				<DrawerStatBox>
					<div className='px-4 py-3'>
						<p className='text-sm leading-relaxed text-content-secondary'>
							{finding.reasoning}
						</p>
					</div>
				</DrawerStatBox>
			</DrawerSection>

			{/* Truth Context — Wave 2.4: no longer surfaces the numeric delta. */}
			{finding.truth_context && finding.truth_context.has_contradictions && (
				<DrawerSection title={td("evidence_contradictions")} accent='warning'>
					<DrawerStatBox accent='warning'>
						<div className='px-4 py-3'>
							<p className='text-xs text-amber-600 dark:text-amber-300'>
								{td("contradictions_detected", {
									count: finding.truth_context.contradiction_count,
								})}
							</p>
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Knowledge Base Link — always render as a styled link */}
			<section>
				<a
					href={
						kbLink
							? `/app/knowledge-base/${kbLink.slug}`
							: `/app/knowledge-base?finding=${encodeURIComponent(finding.inference_key)}`
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
							{td("learn_more")}
						</div>
						<div className='mt-0.5 truncate text-sm font-medium text-content'>
							{kbLink ? kbLink.title : td("browse_related_docs")}
						</div>
						<div className='mt-0.5 line-clamp-2 text-xs text-content-muted'>
							{kbLink?.excerpt || td("docs_coming_soon")}
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

			{/* Discuss CTA */}
			{finding.polarity !== "positive" && (
				<section className='pt-2'>
					<button
						onClick={onDiscuss}
						className='w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15 dark:text-emerald-400'
					>
						{td("discuss_finding")}
					</button>
				</section>
			)}
		</div>
	);
}

// ── Pack Badge with distinct color per pack ──

const packBadgeStyles: Record<string, string> = {
	scale_readiness:
		"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
	revenue_integrity:
		"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
	chargeback_resilience:
		"bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
	saas_growth_readiness:
		"bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

function PackBadge({ pack, label }: { pack: string; label: string }) {
	const style =
		packBadgeStyles[pack] || "bg-surface-inset text-content-muted border-edge";
	return (
		<span
			className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${style}`}
		>
			{label}
		</span>
	);
}

// ── Info Tooltip ──

function InfoTooltip({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	return (
		<span className='relative inline-flex'>
			<button
				type='button'
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				onClick={() => setOpen((v) => !v)}
				className='flex h-4 w-4 items-center justify-center rounded-full border border-edge text-[10px] font-bold text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted'
			>
				i
			</button>
			{open && (
				<div className='absolute left-6 top-0 z-50 w-64 rounded-lg border border-edge bg-surface-card px-3 py-2 text-xs leading-relaxed text-content-secondary shadow-xl'>
					{text}
				</div>
			)}
		</span>
	);
}

function EvidenceQualityBar({
	label,
	value,
}: {
	label: string;
	value: number;
}) {
	const barColor =
		value >= 70
			? "bg-emerald-500"
			: value >= 40
				? "bg-amber-500"
				: "bg-red-500";

	return (
		<div className='flex items-center gap-3'>
			<span className='w-28 shrink-0 text-xs text-content-muted'>{label}</span>
			<div className='h-1.5 flex-1 rounded-full bg-surface-inset'>
				<div
					className={`h-1.5 rounded-full transition-all ${barColor}`}
					style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
				/>
			</div>
			<span className='w-8 text-right font-mono text-xs text-content-muted'>
				{value}
			</span>
		</div>
	);
}
