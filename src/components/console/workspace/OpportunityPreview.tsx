"use client";

/**
 * OpportunityPreview — Shows top opportunities from linked opportunity_refs.
 *
 * Derives from FindingProjection.opportunity_ref (populated by enrichFindingsWithCrossRefs).
 * Each shows hypothesis + value range + effort hint.
 * Hidden if no opportunities exist.
 */

import { useTranslations } from "next-intl";
import type { FindingProjection } from "../../../../packages/projections/types";

function formatDollars(amount: number): string {
	if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
	if (amount > 0) return `$${amount.toFixed(0)}`;
	return "$0";
}

interface Opportunity {
	id: string;
	hypothesis: string;
	min: number;
	max: number;
}

interface Props {
	findings: FindingProjection[];
}

export default function OpportunityPreview({ findings }: Props) {
	const t = useTranslations("console.workspaces.detail.enrichment");
	// Deduplicate opportunities from findings
	const seen = new Set<string>();
	const opportunities: Opportunity[] = [];
	for (const f of findings) {
		if (f.opportunity_ref && !seen.has(f.opportunity_ref.id)) {
			seen.add(f.opportunity_ref.id);
			opportunities.push({
				id: f.opportunity_ref.id,
				hypothesis: f.opportunity_ref.hypothesis,
				min: f.opportunity_ref.value_range.min,
				max: f.opportunity_ref.value_range.max,
			});
		}
	}

	if (opportunities.length === 0) return null;

	const totalMin = opportunities.reduce((s, o) => s + o.min, 0);
	const totalMax = opportunities.reduce((s, o) => s + o.max, 0);

	return (
		<div>
			<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
				{t("opportunities")}
			</h3>
			<div className="space-y-2">
				{opportunities.slice(0, 5).map((opp) => (
					<div
						key={opp.id}
						className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
					>
						<p className="text-xs text-content-secondary">{opp.hypothesis}</p>
						<span className="mt-1 inline-block text-[11px] font-mono text-emerald-400">
							{formatDollars(opp.min)}–{formatDollars(opp.max)}/mo
						</span>
					</div>
				))}
			</div>
			{opportunities.length > 0 && (
				<div className="mt-3 flex items-center justify-between rounded-lg bg-surface-inset px-3 py-2">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">
						{t("combined_potential")}
					</span>
					<span className="text-xs font-bold text-emerald-400">
						{formatDollars(totalMin)}–{formatDollars(totalMax)}/mo
					</span>
				</div>
			)}
		</div>
	);
}
