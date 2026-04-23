"use client";

/**
 * RevenueIntelligence — Domain-specific primary view for the revenue workspace.
 *
 * Layout: Funnel Integrity Map (full width, clickable) + Opportunity Preview.
 * TrustScoreCard removed — redundant with findings table.
 */

import type { FindingProjection } from "../../../../packages/projections/types";
import FunnelIntegrityMap from "./FunnelIntegrityMap";
import OpportunityPreview from "./OpportunityPreview";

interface Props {
	findings: FindingProjection[];
	onFindingClick?: (finding: FindingProjection) => void;
}

export default function RevenueIntelligence({ findings, onFindingClick }: Props) {
	return (
		<div className="space-y-4">
			<FunnelIntegrityMap findings={findings} onFindingClick={onFindingClick} />
			<OpportunityPreview findings={findings} />
		</div>
	);
}
