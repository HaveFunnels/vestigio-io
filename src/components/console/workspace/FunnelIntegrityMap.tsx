"use client";

/**
 * FunnelIntegrityMap — Horizontal flow visualization for the revenue workspace.
 *
 * Shows: Discovery → Interest → Decision → Purchase → Post-purchase
 * Each stage shows finding count + aggregate impact.
 * Stage classification derived from FindingProjection.surface URL patterns.
 * Always visible — works from crawl data alone.
 */

import type { FindingProjection } from "../../../../packages/projections/types";

interface FunnelStage {
	id: string;
	label: string;
	/** URL patterns that map to this stage */
	patterns: RegExp[];
}

const FUNNEL_STAGES: FunnelStage[] = [
	{
		id: "discovery",
		label: "Discovery",
		patterns: [/^\/$/, /\/home/i, /\/landing/i, /\/lp\//i],
	},
	{
		id: "interest",
		label: "Interest",
		patterns: [/\/product/i, /\/collection/i, /\/category/i, /\/catalog/i, /\/pricing/i, /\/plan/i],
	},
	{
		id: "decision",
		label: "Decision",
		patterns: [/\/cart/i, /\/bag/i, /\/review/i, /\/compare/i],
	},
	{
		id: "purchase",
		label: "Purchase",
		patterns: [/\/checkout/i, /\/payment/i, /\/order/i, /\/subscribe/i, /\/signup/i],
	},
	{
		id: "post_purchase",
		label: "Post-purchase",
		patterns: [/\/account/i, /\/thank/i, /\/confirm/i, /\/success/i, /\/dashboard/i, /\/support/i],
	},
];

function classifyStage(surface: string): string {
	for (const stage of FUNNEL_STAGES) {
		if (stage.patterns.some((p) => p.test(surface))) return stage.id;
	}
	return "discovery"; // fallback
}

function formatDollars(amount: number): string {
	if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
	if (amount > 0) return `$${amount.toFixed(0)}`;
	return "$0";
}

const STAGE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
	discovery: { bg: "bg-blue-500/10", text: "text-blue-400", bar: "bg-blue-500" },
	interest: { bg: "bg-violet-500/10", text: "text-violet-400", bar: "bg-violet-500" },
	decision: { bg: "bg-amber-500/10", text: "text-amber-400", bar: "bg-amber-500" },
	purchase: { bg: "bg-red-500/10", text: "text-red-400", bar: "bg-red-500" },
	post_purchase: { bg: "bg-emerald-500/10", text: "text-emerald-400", bar: "bg-emerald-500" },
};

interface Props {
	findings: FindingProjection[];
}

export default function FunnelIntegrityMap({ findings }: Props) {
	// Classify findings into stages
	const stageData = new Map<string, { count: number; impact: number }>();
	for (const stage of FUNNEL_STAGES) {
		stageData.set(stage.id, { count: 0, impact: 0 });
	}

	const negativeFindings = findings.filter((f) => f.polarity === "negative");
	for (const f of negativeFindings) {
		const stageId = classifyStage(f.surface || "/");
		const data = stageData.get(stageId)!;
		data.count++;
		data.impact += f.impact?.midpoint || 0;
	}

	const maxImpact = Math.max(...[...stageData.values()].map((d) => d.impact), 1);

	return (
		<div>
			<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
				Funnel Integrity
			</h3>

			{/* Horizontal flow */}
			<div className="flex items-stretch gap-1">
				{FUNNEL_STAGES.map((stage, i) => {
					const data = stageData.get(stage.id)!;
					const colors = STAGE_COLORS[stage.id];
					const barHeight = data.impact > 0 ? Math.max(20, (data.impact / maxImpact) * 100) : 0;

					return (
						<div key={stage.id} className="flex flex-1 flex-col items-center gap-1">
							{/* Arrow connector */}
							{i > 0 && (
								<div className="absolute -left-2 top-1/2 -translate-y-1/2">
									<svg className="h-2 w-2 text-content-faint" viewBox="0 0 8 8" fill="none">
										<path d="M2 1l4 3-4 3" stroke="currentColor" strokeWidth="1" />
									</svg>
								</div>
							)}

							{/* Stage card */}
							<div className={`w-full rounded-lg border border-edge/30 ${colors.bg} px-2 py-2 text-center`}>
								<div className="text-[10px] font-medium text-content-muted">{stage.label}</div>
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
									<div className="mt-1 text-xs text-emerald-400">OK</div>
								)}
							</div>

							{/* Impact bar */}
							<div className="h-8 w-full flex items-end justify-center">
								{barHeight > 0 && (
									<div
										className={`w-3 rounded-t ${colors.bar} opacity-60`}
										style={{ height: `${barHeight}%` }}
									/>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
