"use client";

/**
 * FunnelIntegrityMap — Horizontal flow visualization for the revenue workspace.
 *
 * Shows: Discovery → Interest → Decision → Purchase → Post-purchase
 * Each stage shows finding count + aggregate impact.
 * Stage classification derived from FindingProjection.surface URL patterns.
 * Always visible — works from crawl data alone.
 */

import { useTranslations } from "next-intl";
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

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
	discovery: { bg: "bg-blue-500/10", text: "text-blue-400" },
	interest: { bg: "bg-violet-500/10", text: "text-violet-400" },
	decision: { bg: "bg-amber-500/10", text: "text-amber-400" },
	purchase: { bg: "bg-red-500/10", text: "text-red-400" },
	post_purchase: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
};

interface Props {
	findings: FindingProjection[];
}

export default function FunnelIntegrityMap({ findings }: Props) {
	const t = useTranslations("console.workspaces");

	const stageData = new Map<string, { count: number; impact: number }>();
	for (const id of STAGE_IDS) {
		stageData.set(id, { count: 0, impact: 0 });
	}

	const negativeFindings = findings.filter((f) => f.polarity === "negative");
	for (const f of negativeFindings) {
		const stageId = classifyStage(f.surface || "/");
		const data = stageData.get(stageId)!;
		data.count++;
		data.impact += f.impact?.midpoint || 0;
	}

	return (
		<div>
			<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
				{t("detail.enrichment.funnel_integrity")}
			</h3>

			<div className="flex items-center gap-1">
				{STAGE_IDS.map((id, i) => {
					const data = stageData.get(id)!;
					const colors = STAGE_COLORS[id];

					return (
						<div key={id} className="flex flex-1 items-center">
							{/* Arrow connector between stages */}
							{i > 0 && (
								<svg className="mx-0.5 h-3 w-3 shrink-0 text-content-faint/50" viewBox="0 0 8 8" fill="none">
									<path d="M2 1l4 3-4 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							)}

							{/* Stage card */}
							<div className={`w-full rounded-lg border border-edge/30 ${colors.bg} px-2 py-2 text-center`}>
								<div className="text-[10px] font-medium text-content-muted">
									{t(`detail.enrichment.funnel_stages.${id}`)}
								</div>
								{data.count > 0 ? (
									<>
										<div className={`mt-1 text-sm font-bold ${colors.text}`}>
											{data.count}
										</div>
										<div className="text-[10px] text-content-faint">
											{formatDollars(data.impact)}/mo
										</div>
									</>
								) : (
									<div className="mt-1 text-xs text-emerald-400">
										{t("detail.enrichment.funnel_ok")}
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
