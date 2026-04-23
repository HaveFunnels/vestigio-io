// ──────────────────────────────────────────────
// Phase 1 mock data — fixture used until the real
// /api/dashboard/overview endpoint ships in Phase 2.
//
// **Why mock first:** Phase 1's goal is to validate the visual
// direction of the bento layout, the typography choices, and the
// widget composition WITHOUT being blocked on backend aggregations
// for things like the health score or the activity heatmap. This
// fixture conforms to the same `DashboardData` shape that the real
// endpoint will return, so wiring real data in Phase 2 is a
// search-and-replace at the page level — zero changes to widgets.
//
// Numbers are deliberately organic (47,283.10 not 50,000.00, +5
// not +10) per the design-taste-frontend rule against round-number
// AI slop. Trends include realistic noise.
// ──────────────────────────────────────────────

import type {
	ActivityHeatmapData,
	ChangeReportData,
	DashboardData,
	ExposureData,
	HealthScoreData,
	MoneyRecoveredData,
} from "./types";
import {
	captionForActivityHeatmap,
	captionForChangeReport,
	captionForExposure,
	captionForHealthScore,
	captionForMoneyRecovered,
} from "./captions";

function isoDay(daysAgo: number): string {
	const d = new Date();
	d.setUTCHours(12, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - daysAgo);
	return d.toISOString().slice(0, 10);
}

// 30-day health trend — climbing from low 70s to current 82, with
// realistic dips. Generated as a fixed array (not random) so the
// chart looks the same on every render and Storybook screenshots
// stay deterministic.
const HEALTH_TREND_30D = [
	71, 72, 70, 73, 74, 72, 75, 76, 75, 77, 78, 76, 79, 80, 78, 81, 82, 80, 83,
	81, 84, 83, 82, 84, 85, 84, 85, 86, 85, 82,
];

// 90-day activity heatmap — biased toward weekdays, occasional
// dense weeks, a stretch of inactivity 6 weeks back, and a
// 14-day current streak.
function generateHeatmap() {
	const days = [];
	let i = 89;
	while (i >= 0) {
		const date = new Date();
		date.setUTCHours(0, 0, 0, 0);
		date.setUTCDate(date.getUTCDate() - i);
		const dow = date.getUTCDay();

		let cycles = 0;
		let actionsResolved = 0;

		// Inactive stretch ~5-6 weeks back
		const inactiveStretch = i >= 35 && i <= 48;
		if (!inactiveStretch) {
			// Weekday vs weekend bias
			const baseChance = dow >= 1 && dow <= 5 ? 0.8 : 0.35;
			if (Math.random() < baseChance + (i < 14 ? 0.15 : 0)) {
				cycles = Math.random() > 0.5 ? 2 : 1;
				actionsResolved = Math.floor(Math.random() * 4);
			}
		}

		days.push({
			date: date.toISOString().slice(0, 10),
			count: cycles + actionsResolved,
			cycles,
			actionsResolved,
		});
		i--;
	}
	return days;
}

// Translator type narrow enough that we can call buildMockDashboardData
// with anything next-intl returns from getTranslations (server) or
// useTranslations (client). Keeping this loose avoids leaking a
// next-intl import into a file that's reused from many surfaces.
type MockTranslator = (key: string) => string;

/**
 * Build a localized MOCK_DASHBOARD_DATA payload.
 *
 * Why a function instead of a constant: the demo / no-env fallback used
 * to ship hardcoded English strings ("Refund policy missing again on
 * checkout") that leaked into the dashboard regardless of the user's
 * preferred language. The titles here are not real findings — they're
 * placeholder copy until the real audit data shows up — but they
 * still need to read in the user's voice.
 *
 * Pass `t` from `getTranslations({ namespace: "console.dashboard.mock_data" })`
 * (server) or `useTranslations("console.dashboard.mock_data")` (client).
 * If translations are not available, callers can use `MOCK_DASHBOARD_DATA`
 * which is the English fallback exposed below.
 */
export function buildMockDashboardData(t: MockTranslator): DashboardData {
	const moneyRecovered: MoneyRecoveredData = {
		totalCents: 4_728_310,
		confirmedCents: 4_230_000,
		claimedCents: 498_310,
		last7dCents: 142_300,
		last30dCents: 340_290,
		currency: "USD",
		lastUpdatedAt: new Date().toISOString(),
		caption: "",
	};
	moneyRecovered.caption = captionForMoneyRecovered(moneyRecovered);

	const healthScore: HealthScoreData = {
		current: 82,
		deltaVsLastCycle: 5,
		trend30d: HEALTH_TREND_30D,
		components: { structural: 86, actionQuality: 78, verification: 81 },
		caption: "",
	};
	healthScore.caption = captionForHealthScore(healthScore);

	const exposure: ExposureData = {
		monthlyCents: 4_724_000,
		deltaVsLastCycleCents: -320_000,
		currency: "USD",
		byPack: [
			{ pack: "revenue_integrity", cents: 2_140_000, colorClass: "bg-emerald-500" },
			{ pack: "scale_readiness", cents: 1_180_000, colorClass: "bg-amber-500" },
			{ pack: "chargeback_resilience", cents: 880_000, colorClass: "bg-red-500" },
			{ pack: "behavioral", cents: 524_000, colorClass: "bg-blue-500" },
		],
		criticalOpenCount: 3,
		criticalDeltaVsLastCycle: -1,
		criticalOpenItems: [
			{
				id: "f_demo_payment_intent_loss",
				inferenceKey: "payment_intent_loss",
				title: t("payment_intent_loss"),
				surface: "/checkout/3ds",
				impactCents: 880_000,
			},
			{
				id: "f_demo_chargeback_proof_gap",
				inferenceKey: "chargeback_proof_gap",
				title: t("chargeback_proof_gap"),
				surface: "/admin/orders",
				impactCents: 540_000,
			},
			{
				id: "f_demo_refund_loop",
				inferenceKey: "refund_recursive_trigger",
				title: t("refund_loop"),
				surface: "/api/webhooks/payment",
				impactCents: 410_000,
			},
		],
		caption: "",
	};
	exposure.caption = captionForExposure(exposure);

	const changeReport: ChangeReportData = {
		newFindings: [
			{ id: "f_trust_boundary_crossed", title: t("trust_boundary_crossed"), impactCents: 420_000, severity: "high" },
			{ id: "f_mobile_checkout_drag", title: t("mobile_checkout_drag"), impactCents: 210_000, severity: "medium" },
			{ id: "f_pricing_page_outdated", title: t("pricing_page_outdated"), impactCents: 85_000, severity: "medium" },
		],
		regressions: [
			{ id: "f_refund_policy_reverted", title: t("refund_policy_reverted"), severity: "high" },
		],
		resolved: [
			{ id: "f_og_image_stale", title: t("og_image_stale"), impactCents: 60_000 },
			{ id: "f_trust_seals_missing", title: t("trust_seals_missing"), impactCents: 180_000 },
		],
		verificationsConfirmed: 4,
		caption: "",
	};
	changeReport.caption = captionForChangeReport(changeReport);

	const activityHeatmap: ActivityHeatmapData = {
		days: generateHeatmap(),
		currentStreak: 14,
		caption: "",
	};
	activityHeatmap.caption = captionForActivityHeatmap(activityHeatmap);

	return {
		moneyRecovered,
		healthScore,
		exposure,
		changeReport,
		activityHeatmap,
		adSpend: {
			totalMonthly: 12500,
			currency: "USD",
			byPlatform: [
				{ platform: "meta_ads", label: "Meta Ads", spend: 8500 },
				{ platform: "google_ads", label: "Google Ads", spend: 4000 },
			],
			hasData: true,
			caption: "Meta Ads leads with $8,500/mo (68% of total).",
		},
		crossSignal: {
			chains: [
				{
					surface: "/checkout",
					links: [
						{ pack: "security_posture", title: t("cross_signal_security"), severity: "high", impactCents: 124000, findingId: "mock-cs-1" },
						{ pack: "revenue", title: t("cross_signal_revenue"), severity: "critical", impactCents: 241000, findingId: "mock-cs-2" },
					],
					totalImpactCents: 365000,
				},
			],
			totalChains: 1,
			totalImpactCents: 365000,
			caption: "1 cross-domain pattern detected on checkout.",
		},
	};
}

// Build the mock by populating the slices then injecting captions
// from the same helpers the real aggregator uses — so the mock and
// the prod path always agree on wording rules.
const moneyRecovered: MoneyRecoveredData = {
	totalCents: 4_728_310, // $47,283.10
	confirmedCents: 4_230_000, // $42,300 evidence-backed
	claimedCents: 498_310, // $4,983.10 awaiting cycle confirmation
	last7dCents: 142_300, // $1,423.00
	last30dCents: 340_290, // $3,402.90
	currency: "USD",
	lastUpdatedAt: new Date().toISOString(),
	caption: "",
};
moneyRecovered.caption = captionForMoneyRecovered(moneyRecovered);

const healthScore: HealthScoreData = {
	current: 82,
	deltaVsLastCycle: 5,
	trend30d: HEALTH_TREND_30D,
	components: { structural: 86, actionQuality: 78, verification: 81 },
	caption: "",
};
healthScore.caption = captionForHealthScore(healthScore);

const exposure: ExposureData = {
	monthlyCents: 4_724_000, // $47,240/mo
	deltaVsLastCycleCents: -320_000, // exposure DECREASED by $3.2k — good
	currency: "USD",
	byPack: [
		{
			pack: "revenue_integrity",
			cents: 2_140_000,
			colorClass: "bg-emerald-500",
		},
		{ pack: "scale_readiness", cents: 1_180_000, colorClass: "bg-amber-500" },
		{ pack: "chargeback_resilience", cents: 880_000, colorClass: "bg-red-500" },
		{ pack: "behavioral", cents: 524_000, colorClass: "bg-blue-500" },
	],
	criticalOpenCount: 3,
	criticalDeltaVsLastCycle: -1,
	criticalOpenItems: [
		{
			id: "f_demo_payment_intent_loss",
			inferenceKey: "payment_intent_loss",
			title: "Buyers are dropping out at the 3DS security step",
			surface: "/checkout/3ds",
			impactCents: 880_000,
		},
		{
			id: "f_demo_chargeback_proof_gap",
			inferenceKey: "chargeback_proof_gap",
			title: "You are losing chargebacks because the proof is missing",
			surface: "/admin/orders",
			impactCents: 540_000,
		},
		{
			id: "f_demo_refund_loop",
			inferenceKey: "refund_recursive_trigger",
			title: "Refunds are firing twice on retried payments",
			surface: "/api/webhooks/payment",
			impactCents: 410_000,
		},
	],
	caption: "",
};
exposure.caption = captionForExposure(exposure);

const changeReport: ChangeReportData = {
	newFindings: [
		{
			id: "f_trust_boundary_crossed",
			title: "Buyers are getting bounced to a different domain at checkout",
			impactCents: 420_000,
			severity: "high",
		},
		{
			id: "f_mobile_checkout_drag",
			title: "Your mobile checkout takes 4.8s before the buyer can do anything",
			impactCents: 210_000,
			severity: "medium",
		},
		{
			id: "f_pricing_page_outdated",
			title: "Your pricing page is showing a plan that no longer exists",
			impactCents: 85_000,
			severity: "medium",
		},
	],
	regressions: [
		{
			id: "f_refund_policy_reverted",
			title: "Your refund policy disappeared from checkout again",
			severity: "high",
		},
	],
	resolved: [
		{
			id: "f_og_image_stale",
			title: "Your homepage was sharing an outdated preview image",
			impactCents: 60_000,
		},
		{
			id: "f_trust_seals_missing",
			title: "The trust seals were missing at the payment step",
			impactCents: 180_000,
		},
	],
	verificationsConfirmed: 4,
	caption: "",
};
changeReport.caption = captionForChangeReport(changeReport);

const activityHeatmap: ActivityHeatmapData = {
	days: generateHeatmap(),
	currentStreak: 14,
	caption: "",
};
activityHeatmap.caption = captionForActivityHeatmap(activityHeatmap);

export const MOCK_DASHBOARD_DATA: DashboardData = {
	moneyRecovered,
	healthScore,
	exposure,
	changeReport,
	activityHeatmap,
	adSpend: {
		totalMonthly: 12500,
		currency: "USD",
		byPlatform: [
			{ platform: "meta_ads", label: "Meta Ads", spend: 8500 },
			{ platform: "google_ads", label: "Google Ads", spend: 4000 },
		],
		hasData: true,
		caption: "Meta Ads leads with $8,500/mo (68% of total).",
	},
	crossSignal: {
		chains: [
			{
				surface: "/checkout",
				links: [
					{ pack: "security_posture", title: "Missing CSP headers on checkout", severity: "high", impactCents: 124000, findingId: "demo-cs-1" },
					{ pack: "revenue", title: "Checkout trust indicators absent", severity: "critical", impactCents: 241000, findingId: "demo-cs-2" },
					{ pack: "behavioral", title: "3 rage-click sessions on payment form", severity: "medium", impactCents: 89000, findingId: "demo-cs-3" },
				],
				totalImpactCents: 454000,
			},
			{
				surface: "/product/premium-plan",
				links: [
					{ pack: "revenue", title: "Pricing page missing social proof", severity: "high", impactCents: 178000, findingId: "demo-cs-4" },
					{ pack: "chargeback", title: "No refund policy visible before purchase", severity: "medium", impactCents: 67000, findingId: "demo-cs-5" },
				],
				totalImpactCents: 245000,
			},
		],
		totalChains: 2,
		totalImpactCents: 699000,
		caption: "2 cross-domain patterns detected — checkout is the highest-impact surface.",
	},
};
