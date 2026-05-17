"use client";

/**
 * FunnelIntegrityMap — Horizontal flow visualization for the revenue workspace.
 *
 * Shows: Awareness → Consideration → Decision → Conversion → Post-conversion
 * Each stage shows finding count + aggregate impact.
 *
 * Classification uses the SAME engine logic as the user-journey map:
 *   - classifyPageType() from packages/behavioral/surface-normalizer.ts
 *   - stageOrder from src/app/api/maps/user-journey/route.ts
 *
 * This ensures consistent page classification across all views.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrency } from "@/lib/format-currency";
import SeverityBadge from "@/components/console/SeverityBadge";
import { classifyPageType } from "../../../../packages/behavioral/surface-normalizer";
import type { FindingProjection } from "../../../../packages/projections/types";

/**
 * Funnel stage groupings — maps engine SurfacePageType → funnel stage.
 * Aligned with stageOrder in user-journey route.
 */
const PAGE_TYPE_TO_STAGE: Record<string, string> = {
	homepage: "awareness",
	landing: "awareness",
	blog: "awareness",
	category: "consideration",
	product: "consideration",
	pricing: "consideration",
	cart: "decision",
	checkout: "conversion",
	thank_you: "post_conversion",
	account: "post_conversion",
	support: "post_conversion",
	policy: "post_conversion",
	onboarding: "post_conversion",
	unknown: "awareness", // fallback
};

const STAGE_IDS = ["awareness", "consideration", "decision", "conversion", "post_conversion"] as const;

function classifyStage(surface: string): string {
	const pageType = classifyPageType(surface);
	return PAGE_TYPE_TO_STAGE[pageType] || "awareness";
}

// formatDollars resolved inside component via useMcpData

// Stage colors mirror the funnel_journey pack palette from src/lib/pack-colors.ts —
// vivid 400/500-level accents per stage. Conversion is NOT auto-red; the
// stage card paints red ONLY when `data.count > 0` (a problem exists),
// otherwise the cyan accent stays neutral.
const STAGE_COLORS: Record<string, { bg: string; text: string; border: string; activeBg: string; negativeText: string; negativeBg: string; negativeBorder: string }> = {
	awareness:       { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/30",    activeBg: "bg-blue-500/15",    negativeText: "text-blue-300",    negativeBg: "bg-blue-500/15",    negativeBorder: "border-blue-500/40" },
	consideration:   { bg: "bg-violet-500/10",  text: "text-violet-400",  border: "border-violet-500/30",  activeBg: "bg-violet-500/15",  negativeText: "text-violet-300",  negativeBg: "bg-violet-500/15",  negativeBorder: "border-violet-500/40" },
	decision:        { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/30",   activeBg: "bg-amber-500/15",   negativeText: "text-amber-300",   negativeBg: "bg-amber-500/15",   negativeBorder: "border-amber-500/40" },
	conversion:      { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/30",    activeBg: "bg-cyan-500/15",    negativeText: "text-red-400",     negativeBg: "bg-red-500/10",     negativeBorder: "border-red-500/30" },
	post_conversion: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", activeBg: "bg-emerald-500/15", negativeText: "text-emerald-300", negativeBg: "bg-emerald-500/15", negativeBorder: "border-emerald-500/40" },
};

interface Props {
	findings: FindingProjection[];
	onFindingClick?: (finding: FindingProjection) => void;
}

export default function FunnelIntegrityMap({ findings, onFindingClick }: Props) {
	const t = useTranslations("console.workspaces");
	const tc = useTranslations("console.common");
	const { currency } = useMcpData();
	const formatDollars = (amount: number) => fmtCurrency(amount, currency);
	const [expandedStage, setExpandedStage] = useState<string | null>(null);

	// Classify findings into stages using the engine's classifyPageType
	const stageFindings = new Map<string, FindingProjection[]>();
	const stageData = new Map<string, { count: number; impact: number }>();
	for (const id of STAGE_IDS) {
		stageFindings.set(id, []);
		stageData.set(id, { count: 0, impact: 0 });
	}

	const negativeFindings = findings.filter((f) => f.polarity === "negative");
	for (const f of negativeFindings) {
		const stageId = classifyStage(f.surface || "/");
		stageFindings.get(stageId)!.push(f);
		const data = stageData.get(stageId)!;
		data.count++;
		data.impact += f.impact?.midpoint || 0;
	}

	const expandedItems = expandedStage ? stageFindings.get(expandedStage) || [] : [];
	const expandedColors = expandedStage ? STAGE_COLORS[expandedStage] : null;

	return (
		<div>
			<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
				{t("detail.enrichment.funnel_integrity")}
			</h3>

			{/* Stage cards */}
			<div className="flex items-center gap-1">
				{STAGE_IDS.map((id, i) => {
					const data = stageData.get(id)!;
					const colors = STAGE_COLORS[id];
					const isExpanded = expandedStage === id;
					const isClickable = data.count > 0;
					const hasIssues = data.count > 0;

					return (
						<div key={id} className="flex flex-1 items-center">
							{i > 0 && (
								<svg className="mx-0.5 h-3 w-3 shrink-0 text-content-faint/50" viewBox="0 0 8 8" fill="none">
									<path d="M2 1l4 3-4 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							)}

							<button
								type="button"
								disabled={!isClickable}
								onClick={() => setExpandedStage(isExpanded ? null : id)}
								className={`w-full rounded-lg border px-2 py-3 text-center transition-all ${
									isExpanded
										? `${hasIssues ? colors.negativeBg : colors.activeBg} ${hasIssues ? colors.negativeBorder : colors.border} ring-1 ring-inset ring-white/5`
										: `${hasIssues ? colors.negativeBg : colors.bg} ${hasIssues ? colors.negativeBorder : "border-edge/30"}`
								} ${isClickable ? "cursor-pointer hover:border-white/10" : "cursor-default"}`}
							>
								<div className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
									{t(`detail.enrichment.funnel_stages.${id}`)}
								</div>
								{hasIssues ? (
									<>
										<div className={`mt-1.5 text-base font-bold ${colors.negativeText}`}>
											{data.count}
										</div>
										<div className="text-[10px] text-content-muted">
											{formatDollars(data.impact)}{tc("per_month_short")}
										</div>
									</>
								) : (
									<div className="mt-1.5 text-xs font-medium text-emerald-400">
										{t("detail.enrichment.funnel_ok")}
									</div>
								)}
							</button>
						</div>
					);
				})}
			</div>

			{/* Expanded findings list */}
			{expandedStage && expandedItems.length > 0 && expandedColors && (
				<div className={`mt-3 rounded-lg border ${expandedColors.negativeBorder} ${expandedColors.negativeBg} p-3`}>
					<div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
						{t(`detail.enrichment.funnel_stages.${expandedStage}`)} — {expandedItems.length} {expandedItems.length === 1 ? t("detail.enrichment.findings_singular") : t("detail.enrichment.findings_plural")}
					</div>
					<div className="space-y-1.5">
						{expandedItems.map((f) => (
							<button
								key={f.id}
								type="button"
								onClick={() => onFindingClick?.(f)}
								className="flex w-full items-center gap-3 rounded-md bg-surface-card/60 px-3 py-2 text-left transition-colors hover:bg-surface-card"
							>
								<div className="min-w-0 flex-1">
									<div className="text-xs text-content-secondary">{f.title}</div>
									{f.surface && (
										<div className="mt-0.5 truncate font-mono text-[10px] text-content-faint">
											{f.surface}
										</div>
									)}
								</div>
								<SeverityBadge value={f.severity} />
								{f.impact?.midpoint > 0 && (
									<span className="shrink-0 font-mono text-[10px] text-content-muted">
										{formatDollars(f.impact.midpoint)}{tc("per_month_short")}
									</span>
								)}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
