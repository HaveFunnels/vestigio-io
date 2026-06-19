// ──────────────────────────────────────────────
// Dashboard Captions — narrative interpretation layer
//
// Each function takes a slice of `DashboardData` and returns a short
// (≤90 char) human sentence that interprets the numbers. These are
// what the user actually reads on the bento cards under the hero
// number — the captions answer "so what?" without making them
// open another panel.
//
// **Where this lives, not in the widgets:**
//   - Captions need to be testable independently of React.
//   - The aggregator computes them once on the server so the
//     wording is consistent everywhere (widget, future digest
//     emails, future PDF exports, future MCP chat answers).
//   - i18n: captions are locale-aware via the `CaptionTranslations`
//     parameter. When no translations are provided, defaults to EN.
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

/**
 * Locale-aware caption translations. Keyed by template ID.
 * The aggregator loads these from the dictionary at request time
 * and passes them through so captions render in the user's language.
 */
export interface CaptionTranslations {
	pack_labels?: Record<string, string>;
	money_recovered?: Record<string, string>;
	health_score?: Record<string, string>;
	exposure?: Record<string, string>;
	change_report?: Record<string, string>;
	activity_heatmap?: Record<string, string>;
	cross_signal?: Record<string, string>;
}

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

// Locale-aware pack label. Checks translations first, then falls
// back to the snake_case → human-readable conversion.
function packLabel(pack: string, translations?: CaptionTranslations): string {
	if (translations?.pack_labels?.[pack]) {
		return translations.pack_labels[pack];
	}
	const cleaned = pack.replaceAll("_", " ");
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ──────────────────────────────────────────────
// Money Recovered
// ──────────────────────────────────────────────
export function captionForMoneyRecovered(d: MoneyRecoveredData, translations?: CaptionTranslations): string {
	const t = translations?.money_recovered;
	if (d.totalCents === 0) {
		return t?.first_cycle ?? "First cycle still computing — recoveries will appear here";
	}
	if (d.claimedCents > 0 && d.confirmedCents === 0) {
		const tpl = t?.claimed_pending ?? "{amount} marked done — next cycle will confirm";
		return tpl.replace("{amount}", formatUSD(d.claimedCents));
	}
	if (d.claimedCents > 0 && d.confirmedCents > 0) {
		const tpl = t?.claimed_and_confirmed ?? "{confirmed} confirmed, {claimed} awaiting verification";
		return tpl.replace("{confirmed}", formatUSD(d.confirmedCents)).replace("{claimed}", formatUSD(d.claimedCents));
	}
	if (d.last7dCents === 0 && d.last30dCents === 0) {
		const tpl = t?.quiet_month ?? "{amount} cleared all-time — quiet stretch this month";
		return tpl.replace("{amount}", formatUSD(d.confirmedCents));
	}
	if (d.last7dCents > d.last30dCents * 0.5) {
		const tpl = t?.strong_week ?? "Strong week — {amount} reclaimed in the last 7 days";
		return tpl.replace("{amount}", formatUSD(d.last7dCents));
	}
	if (d.last30dCents > 0 && d.last7dCents === 0) {
		const tpl = t?.quiet_week ?? "Quiet week — {amount} cleared this month overall";
		return tpl.replace("{amount}", formatUSD(d.last30dCents));
	}
	const tpl = t?.last_30d ?? "{amount} recovered in the last 30 days";
	return tpl.replace("{amount}", formatUSD(d.last30dCents));
}

// ──────────────────────────────────────────────
// Health Score
// ──────────────────────────────────────────────
export function captionForHealthScore(d: HealthScoreData, translations?: CaptionTranslations): string {
	const t = translations?.health_score;
	if (d.current === 0) {
		return t?.first_cycle ?? "Score will appear after the first complete cycle";
	}
	const { structural, actionQuality, verification } = d.components;
	const avg = (structural + actionQuality + verification) / 3;

	const componentNames: Record<string, string> = {
		structural: t?.component_structural ?? "structural",
		action_quality: t?.component_action_quality ?? "action quality",
		verification: t?.component_verification ?? "verification",
	};

	const gaps: Array<{ key: string; gap: number }> = [
		{ key: "structural", gap: structural - avg },
		{ key: "action_quality", gap: actionQuality - avg },
		{ key: "verification", gap: verification - avg },
	];
	const leader = gaps.reduce((a, b) => (b.gap > a.gap ? b : a));
	const laggard = gaps.reduce((a, b) => (b.gap < a.gap ? b : a));
	const leaderName = componentNames[leader.key];
	const laggardName = componentNames[laggard.key];

	if (d.deltaVsLastCycle >= 3) {
		const tpl = t?.climbing ?? "Climbing {delta} points — {component} is gaining ground";
		return tpl.replace("{delta}", String(d.deltaVsLastCycle)).replace("{component}", leaderName);
	}
	if (d.deltaVsLastCycle <= -3) {
		const tpl = t?.falling ?? "Down {delta} points — {component} is the drag";
		return tpl.replace("{delta}", String(Math.abs(d.deltaVsLastCycle))).replace("{component}", laggardName);
	}
	if (d.current >= 80) {
		const tpl = t?.strong ?? "Holding strong around {score} — {component} leading the composite";
		return tpl.replace("{score}", String(d.current)).replace("{component}", leaderName);
	}
	if (d.current >= 60) {
		const tpl = t?.steady ?? "Steady at {score} — {component} is the next thing to fix";
		return tpl.replace("{score}", String(d.current)).replace("{component}", laggardName);
	}
	const tpl = t?.low ?? "At {score} — start with {component} for the biggest lift";
	return tpl.replace("{score}", String(d.current)).replace("{component}", laggardName);
}

// ──────────────────────────────────────────────
// Exposure
// ──────────────────────────────────────────────
export function captionForExposure(d: ExposureData, translations?: CaptionTranslations): string {
	const t = translations?.exposure;
	if (d.monthlyCents === 0) {
		return t?.no_exposure ?? "No open exposure — first scan still in progress";
	}
	const topPack = d.byPack[0];
	if (d.deltaVsLastCycleCents <= -100_000) {
		const credit = topPack
			? ` — ${packLabel(topPack.pack, translations)} ${t?.led_drop ?? "led the drop"}`
			: "";
		const tpl = t?.down ?? "Down {amount} this cycle";
		return tpl.replace("{amount}", formatUSD(d.deltaVsLastCycleCents)) + credit;
	}
	if (d.deltaVsLastCycleCents >= 100_000) {
		const blame = topPack
			? ` — ${packLabel(topPack.pack, translations)} ${t?.needs_attention ?? "needs attention"}`
			: "";
		const tpl = t?.up ?? "Up {amount} this cycle";
		return tpl.replace("{amount}", formatUSD(d.deltaVsLastCycleCents)) + blame;
	}
	if (topPack) {
		const tpl = t?.top_pack ?? "{pack} carries {amount} of the exposure";
		return tpl.replace("{pack}", packLabel(topPack.pack, translations)).replace("{amount}", formatUSD(topPack.cents));
	}
	const tpl = t?.at_risk ?? "{amount} at risk this month";
	return tpl.replace("{amount}", formatUSD(d.monthlyCents));
}

// ──────────────────────────────────────────────
// Change Report
// ──────────────────────────────────────────────
export function captionForChangeReport(d: ChangeReportData, translations?: CaptionTranslations): string {
	const t = translations?.change_report;
	const newCount = d.newFindings.length;
	const regCount = d.regressions.length;
	const resCount = d.resolved.length;
	const total = newCount + regCount + resCount;

	if (total === 0 && d.verificationsConfirmed === 0) {
		return t?.quiet ?? "Quiet cycle — no new movement since the last scan";
	}
	if (regCount > 0 && resCount === 0) {
		const tpl = t?.regressions ?? "{count} {label} this cycle — worth a closer look";
		const label = regCount === 1 ? (t?.regression_singular ?? "regression") : (t?.regression_plural ?? "regressions");
		return tpl.replace("{count}", String(regCount)).replace("{label}", label);
	}
	if (resCount > newCount) {
		const net = resCount - newCount;
		const label = net === 1 ? (t?.improvement_singular ?? "improvement") : (t?.improvement_plural ?? "improvements");
		const tpl = t?.net_improvement ?? "Net {net} {label} — {resolved} resolved, {new} new";
		return tpl.replace("{net}", String(net)).replace("{label}", label).replace("{resolved}", String(resCount)).replace("{new}", String(newCount));
	}
	if (newCount > resCount) {
		const tpl = t?.new_findings ?? "{new} new {new_label}, {resolved} resolved this cycle";
		const newLabel = newCount === 1 ? (t?.finding_singular ?? "finding") : (t?.finding_plural ?? "findings");
		return tpl.replace("{new}", String(newCount)).replace("{new_label}", newLabel).replace("{resolved}", String(resCount));
	}
	if (d.verificationsConfirmed > 0) {
		const tpl = t?.verifications ?? "{count} {label} confirmed this cycle";
		const label = d.verificationsConfirmed === 1 ? (t?.verification_singular ?? "verification") : (t?.verification_plural ?? "verifications");
		return tpl.replace("{count}", String(d.verificationsConfirmed)).replace("{label}", label);
	}
	const tpl = t?.changes ?? "{count} {label} since the last cycle";
	const label = total === 1 ? (t?.change_singular ?? "change") : (t?.change_plural ?? "changes");
	return tpl.replace("{count}", String(total)).replace("{label}", label);
}

// ──────────────────────────────────────────────
// Activity Heatmap
// ──────────────────────────────────────────────
export function captionForActivityHeatmap(d: ActivityHeatmapData, translations?: CaptionTranslations): string {
	const t = translations?.activity_heatmap;
	if (d.currentStreak === 0) {
		const recent = d.days.slice(-7).reduce((acc, day) => acc + day.count, 0);
		if (recent === 0) {
			return t?.no_activity ?? "No activity in the last week — your audits will fill this in";
		}
		return t?.broken ?? "Streak broken — pick it back up tomorrow";
	}
	if (d.currentStreak >= 14) {
		const tpl = t?.longest ?? "{count}-day streak — your longest stretch in a while";
		return tpl.replace("{count}", String(d.currentStreak));
	}
	if (d.currentStreak >= 7) {
		const tpl = t?.building ?? "{count} days in a row — momentum is building";
		return tpl.replace("{count}", String(d.currentStreak));
	}
	const tpl = t?.keep_going ?? "{count}-day streak — keep it going";
	return tpl.replace("{count}", String(d.currentStreak));
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

export function captionForTopPack(_pack: string, cents: number): string {
	if (cents === 0) return "No exposure recorded yet";
	return `${formatUSD(cents)}/mo concentrated in this pack`;
}

// ──────────────────────────────────────────────
// Cross-Signal caption
// ──────────────────────────────────────────────
export function captionForCrossSignal(chainCount: number, translations?: CaptionTranslations): string {
	const t = translations?.cross_signal;
	if (chainCount > 0) {
		const tpl = t?.detected ?? "{count} cross-domain {label} detected across your site";
		const label = chainCount === 1 ? (t?.pattern_singular ?? "pattern") : (t?.pattern_plural ?? "patterns");
		return tpl.replace("{count}", String(chainCount)).replace("{label}", label);
	}
	return t?.none ?? "No cross-domain patterns detected yet";
}
