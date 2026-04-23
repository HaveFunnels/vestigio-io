"use client";

/**
 * FunnelIntegrityMap — Horizontal flow visualization for the revenue workspace.
 *
 * Shows: Discovery → Interest → Decision → Purchase → Post-purchase
 * Each stage shows finding count + aggregate impact.
 * Stage classification derived from FindingProjection.surface URL patterns.
 * Stages are clickable — expand to show their findings inline.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import type { FindingProjection } from "../../../../packages/projections/types";

const STAGE_IDS = ["discovery", "interest", "decision", "purchase", "post_purchase"] as const;

const STAGE_PATTERNS: Record<string, RegExp[]> = {
	discovery: [/^\/$/, /\/home/i, /\/landing/i, /\/lp\//i],
	interest: [/\/product/i, /\/collection/i, /\/category/i, /\/catalog/i, /\/pricing/i, /\/plan/i],
	decision: [/\/cart/i, /\/bag/i, /\/review/i, /\/compare/i],
	purchase: [/\/checkout/i, /\/payment/i, /\/order/i, /\/subscribe/i, /\/signup/i],
	post_purchase: [/\/account/i, /\/thank/i, /\/confirm/i, /\/success/i, /\/dashboard/i, /\/support/i],
};

function classifyStage(surface: string): string {
	for (const id of STAGE_IDS) {
		if (STAGE_PATTERNS[id].some((p) => p.test(surface))) return id;
	}
	return "discovery";
}

function formatDollars(amount: number): string {
	if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
	if (amount > 0) return `$${amount.toFixed(0)}`;
	return "$0";
}

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
	discovery: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", activeBg: "bg-blue-500/15" },
	interest: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30", activeBg: "bg-violet-500/15" },
	decision: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", activeBg: "bg-amber-500/15" },
	purchase: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", activeBg: "bg-red-500/15" },
	post_purchase: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", activeBg: "bg-emerald-500/15" },
};

interface Props {
	findings: FindingProjection[];
	onFindingClick?: (finding: FindingProjection) => void;
}

export default function FunnelIntegrityMap({ findings, onFindingClick }: Props) {
	const t = useTranslations("console.workspaces");
	const [expandedStage, setExpandedStage] = useState<string | null>(null);

	// Classify findings into stages
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

	const expandedFindings = expandedStage ? stageFindings.get(expandedStage) || [] : [];
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
										? `${colors.activeBg} ${colors.border} ring-1 ring-inset ring-white/5`
										: `${colors.bg} border-edge/30`
								} ${isClickable ? "cursor-pointer hover:border-white/10" : "cursor-default"}`}
							>
								<div className="text-[10px] font-medium text-content-muted">
									{t(`detail.enrichment.funnel_stages.${id}`)}
								</div>
								{data.count > 0 ? (
									<>
										<div className={`mt-1.5 text-base font-bold ${colors.text}`}>
											{data.count}
										</div>
										<div className="text-[10px] text-content-faint">
											{formatDollars(data.impact)}/mo
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
			{expandedStage && expandedFindings.length > 0 && expandedColors && (
				<div className={`mt-3 rounded-lg border ${expandedColors.border} ${expandedColors.bg} p-3`}>
					<div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
						{t(`detail.enrichment.funnel_stages.${expandedStage}`)} — {expandedFindings.length} {expandedFindings.length === 1 ? t("detail.enrichment.findings_singular") : t("detail.enrichment.findings_plural")}
					</div>
					<div className="space-y-1.5">
						{expandedFindings.map((f) => (
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
									<span className="shrink-0 font-mono text-[10px] text-content-faint">
										{formatDollars(f.impact.midpoint)}/mo
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
