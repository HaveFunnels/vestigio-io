"use client";

import { useFeedbackMoment } from "@/hooks/useFeedbackMoment";
import FeedbackMoment from "@/components/console/FeedbackMoment";

// ──────────────────────────────────────────────
// NpsPulse — 14-day NPS prompt (bottom-left, z-44)
//
// Mounted once in AppSidebarLayout. Checks 14-day cooldown
// via useFeedbackMoment("nps_14d"). Renders at bottom-left
// to avoid collision with CopilotFab at bottom-right.
// ──────────────────────────────────────────────

export default function NpsPulse() {
	const { shouldShow } = useFeedbackMoment("nps_14d");

	if (!shouldShow) return null;

	return (
		<div className="fixed bottom-4 left-4 z-[44] w-80">
			<FeedbackMoment
				trigger="nps_14d"
				variant="nps"
				questionKey="nps_question"
			/>
		</div>
	);
}
