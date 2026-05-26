"use client";

import type { StrategyPlan } from "./types";
import StrategyPlanPanel from "./StrategyPlanPanel";

/*
 * Print-only wrapper for the strategy plan
 *
 * Used by /app/library/strategy/[month]/export?print=true (Step 10).
 * Forces the panel into print mode by passing showStickyHeader=false
 * and relies on the ?print=true URL query for the data-attribute that
 * gates the print-only CSS in src/styles/strategy.css.
 *
 * Kept as a thin wrapper so the route can swap in env-specific
 * branding (logo, footer) without forking the main panel.
 */

interface Props {
	plan: StrategyPlan;
}

export default function PrintLayout({ plan }: Props) {
	return (
		<div className="bg-white text-[#0b0f1a]">
			<StrategyPlanPanel plan={plan} showStickyHeader={false} />
		</div>
	);
}
