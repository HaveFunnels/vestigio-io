// ──────────────────────────────────────────────
// Dashboard Captions — narrative interpretation layer
//
// Each function takes a slice of `DashboardData` and returns a short
// (≤90 char) human sentence that interprets the numbers. These are
// what the user actually reads on the bento cards under the hero
// number — the captions answer "so what?" without making them
// open another panel.
//
// **Why it lives here, not in the widgets:**
//   - Captions need to be testable independently of React.
//   - The aggregator computes them once on the server so the
//     wording is consistent everywhere (widget, future digest
//     emails, future PDF exports, future MCP chat answers).
//   - Future i18n: replace these strings with i18n keys + format
//     params, all in one place.
//
// **Tone rules:**
//   - Lead with the fact, then the interpretation. ("Down $3.2k —
//     revenue_integrity led the recovery", not "Revenue is great!").
//   - Avoid emojis and exclamation points. The dashboard is a
//     calm dashboard, not a Duolingo notification.
//   - Use plain words for severity ("strong week", "quiet stretch",
//     "needs attention") instead of corporate jargon.
//   - Mention the time window when relevant ("in 30 days", "this
//     cycle"), so the user knows what they're comparing against.
//
// **Defaults:** when there's no data (zero-state, very first
// cycle), every caption falls back to a neutral encouraging line
// instead of a blank string. Empty caption strings are reserved for
// "the engine couldn't generate one", which we treat as a bug.
// ──────────────────────────────────────────────

import type {
	ActivityHeatmapData,
	ChangeReportData,
	ExposureData,
	HealthScoreData,
	MoneyRecoveredData,
} from "./types";

// Compact USD formatter — k for thousands, M for millions, no
// decimals at the high end so the caption stays one short line.
function formatUSD(cents: number): string {
	const dollars = Math.abs(cents) / 100;
	if (dollars >= 1_000_000) {
		return `$${(dollars / 1_000_000).toFixed(1)}M`;
	}
	if (dollars >= 1_000) {
		return `$${(dollars / 1_000).toFixed(1)}k`;
	}
	return `$${Math.round(dollars)}`;
}

// Strip the snake_case prefix and uppercase the first letter, so
// "revenue_integrity" → "Revenue integrity" for human-readable
// inline mentions.
function packLabel(pack: string): string {
	const cleaned = pack.replaceAll("_", " ");
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ──────────────────────────────────────────────
// Money Recovered
// ──────────────────────────────────────────────
export function captionForMoneyRecovered(d: MoneyRecoveredData): string {
	if (d.totalCents === 0) {
		return "First cycle still computing — recoveries will appear here";
	}
	if (d.last7dCents === 0 && d.last30dCents === 0) {
		return `${formatUSD(d.totalCents)} cleared all-time — quiet stretch this month`;
	}
	if (d.last7dCents > d.last30dCents * 0.5) {
		return `Strong week — ${formatUSD(d.last7dCents)} reclaimed in the last 7 days`;
	}
	if (d.last30dCents > 0 && d.last7dCents === 0) {
		return `Quiet week — ${formatUSD(d.last30dCents)} cleared this month overall`;
	}
	return `${formatUSD(d.last30dCents)} recovered in the last 30 days`;
}

// ──────────────────────────────────────────────
// Health Score
// ──────────────────────────────────────────────
export function captionForHealthScore(d: HealthScoreData): string {
	if (d.current === 0) {
		return "Score will appear after the first complete cycle";
	}
	const { structural, actionQuality, verification } = d.components;
	// Find which sub-score is the strongest mover (highest gap from
	// the average) so the caption can call out what's driving the
	// composite up or down.
	const avg = (structural + actionQuality + verification) / 3;
	const gaps: Array<{ name: string; gap: number }> = [
		{ name: "structural", gap: structural - avg },
		{ name: "action quality", gap: actionQuality - avg },
		{ name: "verification", gap: verification - avg },
	];
	const leader = gaps.reduce((a, b) => (b.gap > a.gap ? b : a));
	const laggard = gaps.reduce((a, b) => (b.gap < a.gap ? b : a));

	if (d.deltaVsLastCycle >= 3) {
		return `Climbing ${d.deltaVsLastCycle} points — ${leader.name} is gaining ground`;
	}
	if (d.deltaVsLastCycle <= -3) {
		return `Down ${Math.abs(d.deltaVsLastCycle)} points — ${laggard.name} is the drag`;
	}
	if (d.current >= 80) {
		return `Holding strong around ${d.current} — ${leader.name} leading the composite`;
	}
	if (d.current >= 60) {
		return `Steady at ${d.current} — ${laggard.name} is the next thing to fix`;
	}
	return `At ${d.current} — start with ${laggard.name} for the biggest lift`;
}

// ──────────────────────────────────────────────
// Exposure
// ──────────────────────────────────────────────
export function captionForExposure(d: ExposureData): string {
	if (d.monthlyCents === 0) {
		return "No open exposure — first scan still in progress";
	}
	const topPack = d.byPack[0];
	if (d.deltaVsLastCycleCents <= -100_000) {
		// $1k+ decrease
		const credit = topPack ? ` — ${packLabel(topPack.pack)} led the drop` : "";
		return `Down ${formatUSD(d.deltaVsLastCycleCents)} this cycle${credit}`;
	}
	if (d.deltaVsLastCycleCents >= 100_000) {
		const blame = topPack
			? ` — ${packLabel(topPack.pack)} needs attention`
			: "";
		return `Up ${formatUSD(d.deltaVsLastCycleCents)} this cycle${blame}`;
	}
	if (topPack) {
		return `${packLabel(topPack.pack)} carries ${formatUSD(topPack.cents)} of the exposure`;
	}
	return `${formatUSD(d.monthlyCents)} at risk this month`;
}

// ──────────────────────────────────────────────
// Change Report
// ──────────────────────────────────────────────
export function captionForChangeReport(d: ChangeReportData): string {
	const newCount = d.newFindings.length;
	const regCount = d.regressions.length;
	const resCount = d.resolved.length;
	const total = newCount + regCount + resCount;

	if (total === 0 && d.verificationsConfirmed === 0) {
		return "Quiet cycle — no new movement since the last scan";
	}
	if (regCount > 0 && resCount === 0) {
		return `${regCount} ${regCount === 1 ? "regression" : "regressions"} this cycle — worth a closer look`;
	}
	if (resCount > newCount) {
		const net = resCount - newCount;
		return `Net ${net} ${net === 1 ? "improvement" : "improvements"} — ${resCount} resolved, ${newCount} new`;
	}
	if (newCount > resCount) {
		return `${newCount} new ${newCount === 1 ? "finding" : "findings"}, ${resCount} resolved this cycle`;
	}
	if (d.verificationsConfirmed > 0) {
		return `${d.verificationsConfirmed} ${d.verificationsConfirmed === 1 ? "verification" : "verifications"} confirmed this cycle`;
	}
	return `${total} ${total === 1 ? "change" : "changes"} since the last cycle`;
}

// ──────────────────────────────────────────────
// Activity Heatmap
// ──────────────────────────────────────────────
export function captionForActivityHeatmap(d: ActivityHeatmapData): string {
	if (d.currentStreak === 0) {
		const recent = d.days.slice(-7).reduce((acc, day) => acc + day.count, 0);
		if (recent === 0) {
			return "No activity in the last week — your audits will fill this in";
		}
		return "Streak broken — pick it back up tomorrow";
	}
	if (d.currentStreak >= 14) {
		return `${d.currentStreak}-day streak — your longest stretch in a while`;
	}
	if (d.currentStreak >= 7) {
		return `${d.currentStreak} days in a row — momentum is building`;
	}
	return `${d.currentStreak}-day streak — keep it going`;
}

// ──────────────────────────────────────────────
// Compact KPI captions (for the new bento KPI tiles)
// ──────────────────────────────────────────────
export function captionForOpenCritical(count: number, delta: number): string {
	if (count === 0) {
		return "All clear — no open critical findings";
	}
	if (delta > 0) {
		return `${delta} added this cycle — needs immediate attention`;
	}
	if (delta < 0) {
		return `${Math.abs(delta)} cleared this cycle — keep the pressure on`;
	}
	return `${count} ${count === 1 ? "critical" : "criticals"} open since last cycle`;
}

export function captionForVerificationRate(rate: number): string {
	if (rate >= 80) return "Strong evidence — most findings are confirmed";
	if (rate >= 60) return "Confirmation queue is healthy";
	if (rate >= 40) return "Some findings still waiting on verification";
	return "Verification queue is backing up";
}

export function captionForTopPack(pack: string, cents: number): string {
	if (cents === 0) return "No exposure recorded yet";
	return `${formatUSD(cents)}/mo concentrated in this pack`;
}
