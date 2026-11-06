// ──────────────────────────────────────────────
// Extrato de tráfego pago.
//
// The first v2 surface. Answers one question an operator asks out
// loud: which campaigns bought arrivals that did nothing.
//
// The data has been collected for months and never read. Every
// session aggregate carries attribution.first_touch with the campaign
// name AND Meta's campaign id, at 93% coverage on the only
// instrumented environment, next to max_scroll_depth,
// session_duration_ms and checkout_reached. Nothing here is new
// collection: it is a group-by that nobody wrote.
//
// Three decisions are deliberate, and each one comes from a mistake
// measured in the November review.
//
// 1. RANKING IS BY EXCESS WASTE: VOLUME TIMES POINTS ABOVE THE
//    ACCOUNT'S OWN MEDIAN.
//    Rate alone was the November mistake: the existing behavioural
//    alert fired on TikTok (2,745 sessions, 92% no-scroll) and said
//    nothing about Facebook (57,586 sessions, 76%), a problem 17x
//    larger by volume. But ranking by raw volume is wrong in the
//    opposite direction, and I shipped that first and caught it on
//    the real account: the four biggest rows came back marked
//    'entregando' because waste volume tracks traffic volume, so the
//    operator opened the page and the top was green while the real
//    outlier sat fifth.
//
//    Excess resolves both. A campaign 0.5 points above the median
//    wastes nothing unusual no matter how large it is; one 18.7 points
//    above wastes 152 arrivals that comparable campaigns on the same
//    account do not. The absolute volume still gets stated, once, in
//    the headline sentence, which is the media buyer's legitimate
//    point about the account as a whole.
//
// 2. THE VERDICT IS RELATIVE TO THIS ACCOUNT, NOT TO AN ABSOLUTE.
//    Measured across 35 campaigns with 400+ sessions, no-scroll runs
//    from 66% to 100% with a median of 77%. An absolute threshold
//    would therefore condemn the whole account or nothing in it, and
//    either reading is useless. Until the cohort exists (today it is
//    null, n=1) the only honest comparison is the account's own
//    distribution: "100% against your median of 77%" is a true
//    sentence that needs no market data. When the cohort lands this
//    upgrades to a market comparison without changing the shape.
//
// 3. NO MONEY IN THIS VERSION.
//    The money model was found to compute every R$ from a constant
//    (FALLBACK_INPUTS.monthly_revenue = 50_000), and twenty reviewers
//    scored confidence in the numbers at 3.6 out of 10. Counting is
//    not contestable. Spend per campaign is one API parameter away
//    (the Meta poller fetches level=account and needs level=campaign)
//    and belongs here the moment it exists, as spend wasted, never as
//    revenue lost.
// ──────────────────────────────────────────────

import { MIN_EVENTS_INTERACTIVE } from "./measured-friction";

/** Below this, a campaign's rates are noise. Matches the floor the
 *  friction findings already use for a page. */
export const MIN_SESSIONS_PER_CAMPAIGN = 300;

/** The scroll milestone that separates "arrived" from "saw something".
 *  The pixel records 25/50/75/90; 25 is the first one, so failing it
 *  means the first screen was never passed. */
export const SAW_SOMETHING_MILESTONE = 25;

export interface StatementSessionInput {
	/** Parsed SessionAggregate. */
	aggregate: Record<string, unknown>;
	/** Raw event count, for the bot gate. */
	eventCount: number;
}

export interface CampaignRow {
	/** Campaign name as the operator wrote it in the ad platform. */
	name: string;
	/** The platform's own campaign id, when present. Joins to spend. */
	platformId: string | null;
	source: string;
	sessions: number;
	/** Arrived and never passed the first screen. */
	arrivedBlind: number;
	arrivedBlindPct: number;
	medianDurationS: number;
	/** Reached the action that matters for this business. */
	reachedAction: number;
	reachedActionPct: number;
	completed: number;
	/** Where this campaign's traffic landed most often. */
	topLandingPath: string | null;
	verdict: "desperdicio" | "observar" | "entregando";
	/** Percentage points above the account median. Negative is better. */
	pointsAboveAccount: number;
	/** What pausing this campaign costs: the action-reaches and the
	 *  purchases it still produced. The statement's only suggested
	 *  action is to pause, and it used to not price that action, so the
	 *  operator had to trust a verdict blind. On the live account the
	 *  six waste campaigns together carry 4% of all purchases against
	 *  13% of all sessions, which is a good trade, but it is only a
	 *  good trade because the numbers are on the page. */
	pauseCostActions: number;
	pauseCostPurchases: number;
	/** Arrivals wasted ABOVE what this account wastes normally. The
	 *  ranking key: combines how big the campaign is with how much
	 *  worse than normal it behaves. Zero or negative when at or
	 *  below the account's median. */
	excessBlind: number;
}

export interface TrafficStatement {
	windowStart: string;
	windowEnd: string;
	/** Sessions that passed the bot gate and carried a campaign. */
	attributedSessions: number;
	/** Sessions that passed the bot gate at all, for coverage honesty. */
	measuredSessions: number;
	attributionCoveragePct: number;
	/** The account's own median no-scroll rate, the comparison basis. */
	accountMedianBlindPct: number;
	campaigns: CampaignRow[];
	/** Totals across campaigns above the session floor. */
	totals: {
		campaignsAboveFloor: number;
		arrivedBlind: number;
		sessions: number;
	};
	/** Campaigns dropped for being below the floor, and their sessions. */
	belowFloor: { campaigns: number; sessions: number };
	/**
	 * Non-paid sessions in the same window, as an internal control.
	 *
	 * Answers the question the account median cannot: is this rate bad,
	 * or is it what paid traffic does? Same site, same pages, same
	 * period, so the gap cannot be blamed on the pages. On the live
	 * account paid runs 72.1% no-scroll against direct at 25.2%.
	 *
	 * Declared honestly rather than sold as a control group: direct
	 * traffic includes returning visitors who already know the brand,
	 * so part of any gap is warmth, not quality. What it does establish
	 * is that the pages CAN hold attention, which is what makes the
	 * ad-or-page verdict defensible. Null when there is too little
	 * non-paid traffic to say anything.
	 */
	control: { sessions: number; blind: number; blindPct: number } | null;
}

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Split "Nome da campanha|123456" into name and id.
 *
 * On the LAST pipe, deliberately: Brazilian campaign names contain
 * pipes as separators ("(1-3-X | H1-H4/C1 | POTE) aberto adv+"), so
 * splitting on the first one truncates the name to "(1-3-X".
 */
export function splitCampaignRef(raw: string): { name: string; platformId: string | null } {
	const at = raw.lastIndexOf("|");
	if (at < 0) return { name: raw.trim(), platformId: null };
	const tail = raw.slice(at + 1).trim();
	// Only a long numeric tail is a platform id. "Promo | Black Friday"
	// is a name whose last segment happens to follow a pipe, and
	// truncating it there would hand the operator a campaign they
	// cannot recognise.
	if (!/^\d{6,}$/.test(tail)) return { name: raw.trim(), platformId: null };
	return { name: raw.slice(0, at).trim(), platformId: tail };
}

/** Did this session reach the action that matters? */
function reachedAction(a: Record<string, unknown>, model: string): boolean {
	switch (model) {
		case "form":
			return Boolean(a.form_started);
		case "whatsapp":
		case "external":
			return Boolean(a.handoff_started) || Boolean(a.support_opened);
		// 'checkout' and 'purchase' both mean the commerce path.
		default:
			return Boolean(a.checkout_reached);
	}
}

export function buildTrafficStatement(
	rows: StatementSessionInput[],
	options: {
		windowStart: string;
		windowEnd: string;
		/** BusinessProfile.conversionModel. Decides what "the action"
		 *  means, so a service business is not judged on checkouts. */
		conversionModel?: string | null;
		minSessions?: number;
	},
): TrafficStatement {
	const model = options.conversionModel ?? "checkout";
	const floor = options.minSessions ?? MIN_SESSIONS_PER_CAMPAIGN;

	interface Acc {
		name: string;
		platformId: string | null;
		source: string;
		sessions: number;
		blind: number;
		durations: number[];
		action: number;
		completed: number;
		landing: Map<string, number>;
	}
	const byCampaign = new Map<string, Acc>();
	let measured = 0;
	let attributed = 0;
	let controlSessions = 0;
	let controlBlind = 0;

	for (const row of rows) {
		// Bot gate, same floor the friction measurement already uses: a
		// session with fewer than three events did not interact.
		if (row.eventCount < MIN_EVENTS_INTERACTIVE) continue;
		measured++;

		const a = row.aggregate;
		const ft = (a.attribution as { first_touch?: Record<string, unknown> } | undefined)
			?.first_touch;
		const campaignRaw = typeof ft?.campaign === "string" ? ft.campaign : null;
		if (!campaignRaw) {
			// No campaign means it was not bought. Counted as the control.
			controlSessions++;
			if (num(a.max_scroll_depth) < SAW_SOMETHING_MILESTONE) controlBlind++;
			continue;
		}
		attributed++;

		const { name, platformId } = splitCampaignRef(campaignRaw);
		const key = platformId ?? name;
		const acc: Acc =
			byCampaign.get(key) ??
			{
				name,
				platformId,
				source: typeof ft?.source === "string" ? ft.source : "?",
				sessions: 0,
				blind: 0,
				durations: [],
				action: 0,
				completed: 0,
				landing: new Map(),
			};

		acc.sessions++;
		if (num(a.max_scroll_depth) < SAW_SOMETHING_MILESTONE) acc.blind++;
		acc.durations.push(num(a.session_duration_ms));
		if (reachedAction(a, model)) acc.action++;
		if (a.reached_thank_you) acc.completed++;
		const landing = typeof ft?.landing_url === "string" ? ft.landing_url : null;
		if (landing) {
			let path = landing;
			try {
				path = new URL(landing).pathname;
			} catch {
				// keep the raw value; a malformed URL is still a label
			}
			acc.landing.set(path, (acc.landing.get(path) ?? 0) + 1);
		}
		byCampaign.set(key, acc);
	}

	const all = [...byCampaign.values()];
	const above = all.filter((c) => c.sessions >= floor);
	const below = all.filter((c) => c.sessions < floor);

	// The comparison basis is this account's own median, over campaigns
	// that cleared the floor. See decision 2 in the header.
	const accountMedian = median(above.map((c) => (100 * c.blind) / c.sessions));

	const campaigns: CampaignRow[] = above
		.map((c) => {
			const blindPct = (100 * c.blind) / c.sessions;
			const points = blindPct - accountMedian;
			// Verdict bands, in points above the account's own median.
			// Deliberately wide: the point is to separate the outliers
			// from the normal state of this account, not to grade.
			const verdict: CampaignRow["verdict"] =
				points >= 10 ? "desperdicio" : points >= 3 ? "observar" : "entregando";
			const topLanding =
				[...c.landing.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
			return {
				pauseCostActions: c.action,
				pauseCostPurchases: c.completed,
				excessBlind: Math.max(0, Math.round((c.sessions * points) / 100)),
				name: c.name,
				platformId: c.platformId,
				source: c.source,
				sessions: c.sessions,
				arrivedBlind: c.blind,
				arrivedBlindPct: Math.round(blindPct * 10) / 10,
				medianDurationS: Math.round(median(c.durations) / 1000),
				reachedAction: c.action,
				reachedActionPct: Math.round((1000 * c.action) / c.sessions) / 10,
				completed: c.completed,
				topLandingPath: topLanding,
				verdict,
				pointsAboveAccount: Math.round(points * 10) / 10,
			};
		})
		// Excess waste, not raw volume and not rate. See decision 1.
		.sort((a, b) => b.excessBlind - a.excessBlind || b.arrivedBlind - a.arrivedBlind);

	return {
		windowStart: options.windowStart,
		windowEnd: options.windowEnd,
		attributedSessions: attributed,
		measuredSessions: measured,
		attributionCoveragePct: measured > 0 ? Math.round((1000 * attributed) / measured) / 10 : 0,
		accountMedianBlindPct: Math.round(accountMedian * 10) / 10,
		campaigns,
		totals: {
			campaignsAboveFloor: above.length,
			arrivedBlind: above.reduce((n, c) => n + c.blind, 0),
			sessions: above.reduce((n, c) => n + c.sessions, 0),
		},
		belowFloor: {
			campaigns: below.length,
			sessions: below.reduce((n, c) => n + c.sessions, 0),
		},
		// 300 to match the per-campaign floor: below it the rate is noise
		// and a noisy control is worse than none.
		control:
			controlSessions >= 300
				? {
						sessions: controlSessions,
						blind: controlBlind,
						blindPct: Math.round((1000 * controlBlind) / controlSessions) / 10,
					}
				: null,
	};
}
