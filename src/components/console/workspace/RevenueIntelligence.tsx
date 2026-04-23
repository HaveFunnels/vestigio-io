"use client";

/**
 * RevenueIntelligence — Domain-specific primary view for the revenue workspace.
 *
 * Layout: Funnel Integrity Map (full width) + Opportunity Preview.
 * KPI strip deferred to when CommerceContext is exposed in projections.
 */

import type { FindingProjection } from "../../../../packages/projections/types";
import FunnelIntegrityMap from "./FunnelIntegrityMap";
import OpportunityPreview from "./OpportunityPreview";
import TrustScoreCard from "./TrustScoreCard";

interface Props {
	findings: FindingProjection[];
}

export default function RevenueIntelligence({ findings }: Props) {
	return (
		<div className="space-y-4">
			{/* Funnel Integrity — always visible, works from crawl data */}
			<FunnelIntegrityMap findings={findings} />

			{/* Two-column: Opportunities + Trust Score */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
				<div className="lg:col-span-3">
					<OpportunityPreview findings={findings} />
				</div>
				<div className="lg:col-span-2">
					<TrustScoreCard
						findings={findings}
						filterPacks={["revenue_integrity", "revenue"]}
					/>
				</div>
			</div>
		</div>
	);
}
