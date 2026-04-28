"use client";

/**
 * CopyAlignment -- Domain-specific primary view for the copy_alignment
 * workspace (Wave 3.10 Fase 2). Displays a Copy Health Strip,
 * CRO Dimension Scores, Top Issues, and Strengths.
 *
 * Layout:
 *   - Full-width Copy Health Strip (grade + pages analysed + top issue)
 *   - 60/40 split -- dimension bars (left) + issues & strengths (right)
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { FindingProjection } from "../../../../packages/projections/types";

// ── Copy CRO Dimensions ──
// Each dimension maps to one of the 7 copy root-cause inference keys.

const COPY_DIMENSIONS = [
	{ id: "value_prop", inferenceKey: "value_proposition_buried" },
	{ id: "headlines", inferenceKey: "social_proof_ineffective" },
	{ id: "ctas", inferenceKey: "cta_competing_or_unclear" },
	{ id: "visual_hierarchy", inferenceKey: "copy_funnel_misalignment" },
	{ id: "trust", inferenceKey: "trust_copy_absent_at_decision" },
	{ id: "objections", inferenceKey: "objection_unaddressed" },
	{ id: "friction", inferenceKey: "copy_cross_page_inconsistent" },
] as const;

type DimensionId = (typeof COPY_DIMENSIONS)[number]["id"];

interface DimensionScore {
	id: DimensionId;
	label: string;
	score: number; // 0..100
	issueCount: number;
}

function severityToScore(severity: string): number {
	switch (severity) {
		case "critical":
			return 15;
		case "high":
			return 35;
		case "medium":
			return 60;
		case "low":
			return 80;
		default:
			return 100;
	}
}

function gradeFromScore(score: number): string {
	if (score >= 90) return "A";
	if (score >= 80) return "A-";
	if (score >= 70) return "B";
	if (score >= 60) return "C";
	if (score >= 45) return "D";
	return "F";
}

function gradeColor(grade: string): string {
	if (grade.startsWith("A")) return "text-emerald-500";
	if (grade === "B") return "text-emerald-400";
	if (grade === "C") return "text-amber-500";
	if (grade === "D") return "text-orange-500";
	return "text-red-500";
}

function barColor(score: number): string {
	if (score >= 80) return "bg-emerald-500";
	if (score >= 60) return "bg-emerald-400";
	if (score >= 40) return "bg-amber-500";
	if (score >= 20) return "bg-orange-500";
	return "bg-red-500";
}

interface Props {
	findings: FindingProjection[];
}

export default function CopyAlignment({ findings }: Props) {
	const t = useTranslations("console.workspaces.copy");

	const copyFindings = useMemo(
		() =>
			findings.filter(
				(f) =>
					f.pack === "copy_alignment" ||
					f.inference_key?.startsWith("value_proposition_buried") ||
					f.inference_key?.startsWith("social_proof_ineffective") ||
					f.inference_key?.startsWith("objection_unaddressed") ||
					f.inference_key?.startsWith("cta_competing_or_unclear") ||
					f.inference_key?.startsWith("trust_copy_absent_at_decision") ||
					f.inference_key?.startsWith("copy_funnel_misalignment") ||
					f.inference_key?.startsWith("copy_cross_page_inconsistent"),
			),
		[findings],
	);

	if (copyFindings.length === 0) return null;

	const negativeFindings = copyFindings.filter((f) => f.polarity === "negative");
	const positiveFindings = copyFindings.filter((f) => f.polarity === "positive");

	// Derive dimension scores
	const dimensions: DimensionScore[] = COPY_DIMENSIONS.map((dim) => {
		const dimFindings = copyFindings.filter(
			(f) => f.inference_key === dim.inferenceKey,
		);
		const negatives = dimFindings.filter((f) => f.polarity === "negative");
		const positives = dimFindings.filter((f) => f.polarity === "positive");

		let score: number;
		if (negatives.length === 0 && positives.length === 0) {
			score = 75; // neutral default -- no data for this dimension
		} else if (negatives.length === 0) {
			score = 95; // only positives
		} else {
			// Average the worst severity scores
			const worst = Math.min(...negatives.map((f) => severityToScore(f.severity)));
			const avg =
				negatives.reduce((sum, f) => sum + severityToScore(f.severity), 0) /
				negatives.length;
			score = Math.round((worst + avg) / 2);
		}

		return {
			id: dim.id,
			label: t(`dimensions.${dim.id}`),
			score,
			issueCount: negatives.length,
		};
	});

	// Overall score = weighted average of dimensions
	const overallScore = Math.round(
		dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length,
	);
	const overallGrade = gradeFromScore(overallScore);

	// Pages analysed (unique surfaces)
	const surfaces = new Set(copyFindings.map((f) => f.surface).filter(Boolean));
	const pagesAnalysed = surfaces.size || 1;

	// Top issue = most impactful negative finding
	const topIssue =
		negativeFindings.length > 0
			? negativeFindings.sort(
					(a, b) =>
						(b.impact?.midpoint ?? 0) - (a.impact?.midpoint ?? 0),
				)[0]
			: null;

	// Group negative findings by root cause
	const issuesByRootCause = useMemo(() => {
		const map = new Map<string, FindingProjection[]>();
		for (const f of negativeFindings) {
			const rc = f.root_cause || f.inference_key || "unknown";
			if (!map.has(rc)) map.set(rc, []);
			map.get(rc)!.push(f);
		}
		return [...map.entries()]
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, 7);
	}, [negativeFindings]);

	return (
		<div className="space-y-4">
			{/* ── Copy Health Strip ── */}
			<div className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h3 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("copy_health")}
				</h3>
				<div className="grid grid-cols-3 gap-4">
					{/* Overall Grade */}
					<div className="rounded-xl border border-edge bg-surface-card/50 px-4 py-3 text-center">
						<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
							{t("grade_labels.overall")}
						</div>
						<div
							className={`mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[28px] font-bold ${gradeColor(overallGrade)}`}
						>
							{overallGrade}
						</div>
						<div className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] tabular-nums text-zinc-500">
							{overallScore}/100
						</div>
					</div>
					{/* Pages Analysed */}
					<div className="rounded-xl border border-edge bg-surface-card/50 px-4 py-3 text-center">
						<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
							{t("pages_analyzed")}
						</div>
						<div className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[28px] font-bold tabular-nums text-zinc-700 dark:text-zinc-200">
							{pagesAnalysed}
						</div>
					</div>
					{/* Top Issue */}
					<div className="rounded-xl border border-edge bg-surface-card/50 px-4 py-3 text-center">
						<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
							{t("top_issues")}
						</div>
						<div className="mt-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
							{topIssue
								? topIssue.title.length > 40
									? topIssue.title.slice(0, 37) + "..."
									: topIssue.title
								: "--"}
						</div>
					</div>
				</div>
			</div>

			{/* ── 60/40 Split: Dimensions + Issues ── */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
				{/* Left: CRO Dimension Scores (60%) */}
				<div className="lg:col-span-3">
					<div className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
						<h3 className="mb-4 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
							{t("dimensions_heading")}
						</h3>
						<div className="space-y-3">
							{dimensions.map((dim) => (
								<div key={dim.id} className="flex items-center gap-3">
									<span className="w-28 shrink-0 text-[12px] text-zinc-600 dark:text-zinc-400">
										{dim.label}
									</span>
									<div className="h-[6px] flex-1 rounded-sm bg-zinc-100 dark:bg-white/[0.04]">
										<div
											className={`h-full rounded-sm transition-all ${barColor(dim.score)}`}
											style={{
												width: `${Math.min(100, Math.max(2, dim.score))}%`,
											}}
										/>
									</div>
									<span className="w-8 text-right font-[family-name:var(--font-jetbrains-mono)] text-[11px] tabular-nums text-zinc-500">
										{dim.score}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Right: Top Issues + Strengths (40%) */}
				<div className="space-y-4 lg:col-span-2">
					{/* Top Issues */}
					<div className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
						<h3 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
							{t("top_issues")}
						</h3>
						{issuesByRootCause.length > 0 ? (
							<ul className="space-y-1.5">
								{issuesByRootCause.map(([rc, items]) => (
									<li
										key={rc}
										className="flex items-start gap-2 text-[12px]"
									>
										<span className="mt-0.5 text-red-400">
											&#8226;
										</span>
										<span className="text-zinc-600 dark:text-zinc-400">
											{(() => { try { return t(`root_causes.${rc}`); } catch { return rc.replace(/_/g, " "); } })()}
											<span className="ml-1 text-zinc-400 dark:text-zinc-600">
												({items.length})
											</span>
										</span>
									</li>
								))}
							</ul>
						) : (
							<p className="text-[12px] text-zinc-400 dark:text-zinc-600">
								--
							</p>
						)}
					</div>

					{/* Strengths */}
					<div className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
						<h3 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
							{t("strengths")}
						</h3>
						{positiveFindings.length > 0 ? (
							<ul className="space-y-1.5">
								{positiveFindings.slice(0, 5).map((f) => (
									<li
										key={f.id}
										className="flex items-start gap-2 text-[12px]"
									>
										<span className="mt-0.5 text-emerald-500">
											&#10003;
										</span>
										<span className="text-zinc-600 dark:text-zinc-400">
											{f.title}
										</span>
									</li>
								))}
							</ul>
						) : (
							<p className="text-[12px] text-zinc-400 dark:text-zinc-600">
								--
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
