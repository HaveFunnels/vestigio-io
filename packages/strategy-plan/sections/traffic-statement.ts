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

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** The scroll milestone that separates "arrived" from "saw something".
 *  The pixel records 25/50/75/90; 25 is the first one, so failing it
 *  means the first screen was never passed. */
export const SAW_SOMETHING_MILESTONE = 25;

/**
 * Did this session arrive and do nothing at all?
 *
 * Scroll alone was wrong, and wrong by a factor of 2.8. Six reviewers
 * from service businesses raised the same objection independently: my
 * best visitor converts above the fold and never scrolls 25%. The
 * sharpest version came from a parts distributor whose mechanic reads
 * the part number, confirms stock and PHONES, and who is 60% of R$ 2M
 * a month. The page was telling him to pause the campaign that
 * brought that person.
 *
 * Measured on 50.304 paid sessions in a 30-day window: scroll alone
 * condemned 36.277 of them (72.1%). Of those, 23.147 carried a
 * positive signal of having seen or done something, 63.8% of
 * everything the page was calling waste. 20.584 had a CTA enter the
 * viewport, 1.977 started a form, 1.984 performed a commercial
 * action, and 12 reached the checkout and were still counted as
 * having seen nothing. Honestly measured, the real figure is 13.130,
 * or 26.1%.
 *
 * This is the stronger claim, not the weaker one. 72% strained
 * belief, and four reviewers said so in the same words: it reads as
 * instrumentation error, not waste. 26% of bought traffic doing
 * literally nothing is specific, credible and still worth acting on.
 *
 * Every signal here is positive evidence of engagement, never an
 * inference from absence. `cta_viewed_count` is the load-bearing one
 * and it discriminates rather than firing for everyone: it is absent
 * in just over half of all sessions, so it is not a proxy for "the
 * page rendered".
 */
export const ABSOLUTE_BLIND_FLOOR = 45;

/** Above this a rate stops being plausible behaviour and starts
 *  looking like broken measurement, so the row says so instead of
 *  recommending a cut. Four reviewers read the old 99.8% and 100%
 *  rows as instrumentation error rather than waste, and they were
 *  right: both were desktop sessions whose scroll never fired. */
export const IMPLAUSIBLE_BLIND_PCT = 90;

export function sawNothing(a: Record<string, unknown>): boolean {
	if (num(a.max_scroll_depth) >= SAW_SOMETHING_MILESTONE) return false;
	// A call to action entered the viewport. On a page whose CTA sits
	// above the fold, this is exactly what a converting visit looks
	// like without a single scroll event.
	if (num(a.cta_viewed_count) > 0) return false;
	// Reached the action that matters, by any of the models.
	if (a.form_started || a.checkout_reached || a.support_opened) return false;
	if (a.handoff_started || a.reached_thank_you || a.form_completed) return false;
	if (a.time_to_first_commercial_action_ms != null) return false;
	// Interacted, even unsuccessfully. A dead click is a click.
	if (num(a.dead_click_count) > 0) return false;
	if (num(a.input_focus_abandon_count) > 0) return false;
	if (num(a.hesitation_pause_count) > 0) return false;
	if (num(a.backtrack_count) > 0 || num(a.rapid_backtrack_count) > 0) return false;
	// Went somewhere else on the site, so the first screen was not the
	// end of the visit.
	const prog = a.surface_progression;
	if (Array.isArray(prog) && prog.length > 1) return false;
	return true;
}

export interface StatementSessionInput {
	/** Parsed SessionAggregate. */
	aggregate: Record<string, unknown>;
	/** Raw event count, for the bot gate. */
	eventCount: number;
	/** For the device split. Two reviewers asked for it by name, one
	 *  calling its absence unforgivable on an account whose traffic is
	 *  88% Facebook and therefore overwhelmingly mobile. */
	userAgent?: string | null;
}

/** Coarse on purpose. The useful question is whether the phone and the
 *  desktop behave differently, not which browser version. */
export function deviceOf(userAgent: string | null | undefined): "mobile" | "desktop" | "unknown" {
	if (!userAgent) return "unknown";
	return /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent) ? "mobile" : "desktop";
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
	/**
	 * What to do, not how bad it is.
	 *
	 * The old scheme was `desperdicio | observar | entregando` and it
	 * had two defects that six reviewers found, five of them by
	 * reading the table line by line.
	 *
	 * First, "desperdicio" is a money word on a page that confesses in
	 * its last line that it does not know what anything cost. Nineteen
	 * of twenty reviewers asked for spend, and three independently
	 * said the missing column does not weaken the verdict, it dismantles
	 * it. So the label no longer claims a loss it cannot price.
	 *
	 * Second, the verdict ignored the one column that priced the
	 * recommendation. A row with 12 purchases was marked desperdicio
	 * while another row with the same 12 purchases was marked observar,
	 * and one with 22 purchases was also observar. "Se eu levo essa
	 * tabela pro meu gestor, ele acha esse par em 40 segundos e mata a
	 * ferramenta na frente de todo mundo." Now a campaign that still
	 * sells is never told to be cut: it is told to be fixed.
	 */
	verdict: "cortar" | "corrigir" | "observar" | "entregando" | "medicao_suspeita";
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
	/**
	 * What this campaign cost in the window, joined by the platform's
	 * own campaign id. Null when no ad account is connected or the id
	 * did not match, and the statement then reports counts only.
	 *
	 * This is SPEND, never revenue. A wasted arrival cost money that
	 * left the account; it did not lose a sale that was never going to
	 * happen. The previous money model conflated the two and scored 3.6
	 * out of 10 on trust.
	 */
	/**
	 * The same campaign in the previous window of equal length, when it
	 * ran then. Null for a campaign that is new.
	 *
	 * This is what makes the statement a subscription rather than a
	 * one-off diagnosis: a rate on its own is a photograph, and the
	 * operator's real question is whether it is getting worse. The
	 * investor reviewer put it as the thing that creates switching
	 * cost, and it costs nothing to compute because it is a second
	 * window over the same table.
	 */
	previousBlindPct: number | null;
	/** Points worse than the previous window. Negative is improvement. */
	deltaPoints: number | null;
	/** Share of this campaign's sessions that came from a phone.
	 *  Always present, so a row whose device split is too thin to
	 *  state still says something true about where its traffic is. */
	mobileSharePct: number;
	/** Per device, so a campaign that only fails on one is visible. */
	byDevice: {
		mobile: { sessions: number; blind: number; blindPct: number } | null;
		desktop: { sessions: number; blind: number; blindPct: number } | null;
	};
	spendBrl: number | null;
	/** Of that spend, the share that bought arrivals which saw nothing.
	 *  Proportional to sessions, which is the honest apportionment: the
	 *  platform charges per click, not per scroll. */
	spendWastedBrl: number | null;
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
		/** Completed purchases across every campaign above the floor.
		 *  This is the denominator the trade paragraph uses, and it used
		 *  to appear as a bare number the reader could not reconcile: a
		 *  reviewer summed the visible rows, got a different total and
		 *  asked for the bridge. Stated explicitly now. */
		purchases: number;
		/** Null when no ad account is connected. */
		spendBrl: number | null;
		spendWastedBrl: number | null;
	};
	/** Campaigns dropped for being below the floor, and their sessions. */
	belowFloor: { campaigns: number; sessions: number };
	/**
	 * Paid traffic grouped by the page it landed on, over EVERY
	 * attributed session rather than only the campaigns that cleared
	 * the floor.
	 *
	 * This exists because the floor excludes the buyer. Seven
	 * reviewers in the second cohort worked out their own volume and
	 * concluded their statement would come back empty: a lawyer with
	 * ~1.100 visits across 6 campaigns, a dentist with 900 across 8, an
	 * architect with 2 campaigns, an esthetician with 3. A dropshipper
	 * found the inverse failure, that the campaigns he tests and kills
	 * never reach 300, so the page is blind exactly where he burns
	 * money and visible only where he already knows the answer.
	 *
	 * Both ends proposed the same way out, independently: group by
	 * landing page, because the page has volume when no single
	 * campaign does. Thirty campaigns of 150 sessions landing on one
	 * page are 4.500 sessions, which is not noise. The page-level
	 * section was also the part three reviewers named as the best
	 * thing on the statement, so this promotes what already worked.
	 */
	landingPages: {
		path: string;
		sessions: number;
		arrivedBlind: number;
		arrivedBlindPct: number;
		/** How many distinct campaigns sent traffic here. */
		campaigns: number;
		purchases: number;
	}[];
	/**
	 * Non-paid sessions in the same window, as an internal control.
	 *
	 * Answers the question the account median cannot: is this rate bad,
	 * or is it what paid traffic does? Same site, same pages, same
	 * period, so the gap cannot be blamed on the pages.
	 *
	 * This used to be "every session with no campaign", which is not a
	 * population, it is a residue: a paid session whose campaign tag
	 * broke lands in it. Measured on the instrumented account, 489 of
	 * 3.909 such sessions (12.5%) still carried a paid marker, and
	 * those ran 65.0% no-scroll against 19.6% for the rest. So the
	 * residue was inflating the control and understating the gap. The
	 * paid-marked ones are now excluded and counted separately, which
	 * moved the control from 25.2% to 19.6%.
	 *
	 * Still declared honestly rather than sold as a clean experiment:
	 * non-paid traffic includes returning visitors who already know the
	 * brand, so part of any gap is warmth, not quality. What it does
	 * establish is that the pages CAN hold attention, which is what
	 * makes the ad-or-page verdict defensible. Null when there is too
	 * little non-paid traffic to say anything.
	 */
	control: {
		sessions: number;
		blind: number;
		blindPct: number;
		/** Sessions excluded for carrying a paid marker without a campaign. */
		excludedPaidMarker: number;
	} | null;
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
/**
 * Decode a campaign name the way it was typed in the ad platform.
 *
 * The pixel reads the campaign from the landing URL's query string, so
 * whatever the platform percent-encoded arrives encoded: 85% of the
 * campaigns on the instrumented account came through as
 * "%281-1-X+%7C+H1-H4%2FC1+%7C+POTE%29+aberto+adv%2B". Four of five
 * reviewers flagged it independently, and one put the cost precisely:
 * a product that sells itself on "contagem direta" cannot hand the
 * operator a name they will not find in their own ad manager, because
 * then they stop trusting the number beside it.
 *
 * Plus-to-space before decodeURIComponent, because a query string
 * encodes a space as "+" and decodeURIComponent leaves it alone.
 * Malformed input is returned untouched rather than throwing: a name
 * that cannot be decoded is still better than no row.
 */
/** A real percent escape, as opposed to a stray '%' an operator typed. */
const PERCENT_ESCAPE = /%[0-9A-Fa-f]{2}/;

/**
 * The campaign name as the operator typed it in the ad platform.
 *
 * Most names arrive percent-encoded, because the pixel reads the
 * campaign from the landing URL's query string and query strings are
 * form-encoded: spaces become '+', everything else becomes %XX. On the
 * instrumented account that was 85% of campaigns.
 *
 * The '+' rule only applies inside encoded text. Plenty of real names
 * end in a literal plus ("aberto adv+", "ABERTO 35+"), and a blanket
 * substitution silently renamed them, which the test suite caught. So
 * a name with no percent escape is left exactly as it came.
 */
export function decodeCampaignName(raw: string): string {
	if (!PERCENT_ESCAPE.test(raw)) return raw.trim();
	try {
		return decodeURIComponent(raw.replace(/\+/g, " ")).trim();
	} catch {
		// Undecodable is still better than absent: an operator can
		// recognise a mangled name, not a missing row.
		return raw.trim();
	}
}

/**
 * Does an untagged session still smell like a paid click?
 *
 * The click ids are the strongest evidence: a human typing the address
 * does not bring an fbclid. Source and medium are weaker, because a
 * person can arrive from an organic Instagram post, but on the
 * instrumented account they agreed with the click ids rather than
 * contradicting them, so they stay in. Erring toward exclusion is the
 * right asymmetry: a genuine organic session wrongly dropped only
 * costs sample size, while a paid session wrongly kept corrupts the
 * comparison the page is built on.
 */
function hasPaidMarker(ft: Record<string, unknown> | undefined): boolean {
	if (!ft) return false;
	if (ft.fbclid || ft.gclid || ft.ttclid || ft.msclkid) return true;
	const landing = typeof ft.landing_url === "string" ? ft.landing_url : "";
	if (/[?&](fbclid|gclid|ttclid|msclkid)=/i.test(landing)) return true;
	if (/[?&]utm_medium=(cpc|paid|ppc)/i.test(landing)) return true;
	const medium = typeof ft.medium === "string" ? ft.medium : "";
	if (/^(cpc|paid|ppc|paid_social)/i.test(medium)) return true;
	const source = typeof ft.source === "string" ? ft.source : "";
	return /^(fb|ig|facebook|instagram|tiktok)$/i.test(source.trim());
}

/**
 * The campaign name trimmed to what the operator can recognise.
 *
 * Names arrive with their own bookkeeping attached: one row on the
 * instrumented account reads "aberto adv+ (21/09) - Cópia - Cópia -
 * Cópia - Cópia - Cópia - Cópia - Cópia - Cópia - Cópia". Eight
 * reviewers raised it, and all eight said the same thing: the mess is
 * the customer's, the cleanup is the product's. One counted the copies
 * with a finger on the screen to tell two rows apart, and another
 * noted the name column was wider than every number on the row
 * combined.
 *
 * The copy count is kept rather than discarded, because it is the only
 * thing distinguishing six otherwise identical rows.
 */
export function shortCampaignName(raw: string): string {
	const copies = raw.match(/C[oó]pia/gi)?.length ?? 0;
	// The separator is whatever the ad platform used, and on the live
	// account it is an em dash, which an earlier hyphen-only pattern
	// missed: the copies then survived into the truncation and came out
	// as "(21/09)… (cópia 3)".
	let base = raw.replace(/(\s*[-–—,]?\s*C[oó]pia)+\s*$/gi, "").trim();
	if (base.length > 46) base = base.slice(0, 45).trimEnd() + "…";
	return copies > 0 ? `${base} (cópia ${copies})` : base;
}

export function splitCampaignRef(raw: string): { name: string; platformId: string | null } {
	const at = raw.lastIndexOf("|");
	if (at < 0) return { name: decodeCampaignName(raw), platformId: null };
	const tail = raw.slice(at + 1).trim();
	// Only a long numeric tail is a platform id. "Promo | Black Friday"
	// is a name whose last segment happens to follow a pipe, and
	// truncating it there would hand the operator a campaign they
	// cannot recognise.
	if (!/^\d{6,}$/.test(tail)) return { name: decodeCampaignName(raw), platformId: null };
	return { name: decodeCampaignName(raw.slice(0, at)), platformId: tail };
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
		/** Spend per platform campaign id, from a connected ad account.
		 *  Omitted when nothing is connected. */
		spendByCampaignId?: Map<string, number> | null;
		/** Sessions from the previous window of equal length, for the
		 *  month-over-month comparison. Omitted on a first run. */
		previous?: StatementSessionInput[] | null;
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
		dev: Map<"mobile" | "desktop" | "unknown", { n: number; blind: number }>;
	}
	const byCampaign = new Map<string, Acc>();
	let measured = 0;
	let attributed = 0;
	let controlSessions = 0;
	let controlBlind = 0;
	let controlExcluded = 0;
	interface PageAcc {
		sessions: number;
		blind: number;
		purchases: number;
		campaigns: Set<string>;
	}
	const byPage = new Map<string, PageAcc>();

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
			// Absent campaign does NOT mean the session was not bought.
			// An ad click whose tag was stripped (in-app browser, iOS,
			// a redirect that drops the query string) arrives with no
			// campaign and would be counted as organic, contaminating
			// the one comparison the whole page rests on. Anything
			// still carrying a paid fingerprint is set aside.
			if (hasPaidMarker(ft)) {
				controlExcluded++;
				continue;
			}
			controlSessions++;
			if (sawNothing(a)) controlBlind++;
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
				dev: new Map(),
			};

		acc.sessions++;
		const blind = sawNothing(a);
		if (blind) acc.blind++;
		const dev = deviceOf(row.userAgent);
		const dv = acc.dev.get(dev) ?? { n: 0, blind: 0 };
		dv.n++;
		if (blind) dv.blind++;
		acc.dev.set(dev, dv);
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
			// Accumulated outside the floor on purpose: this is the view
			// that has to work for an account whose campaigns are all
			// too small to judge one by one.
			const pg = byPage.get(path) ?? {
				sessions: 0,
				blind: 0,
				purchases: 0,
				campaigns: new Set<string>(),
			};
			pg.sessions++;
			if (blind) pg.blind++;
			if (a.reached_thank_you) pg.purchases++;
			pg.campaigns.add(key);
			byPage.set(path, pg);
		}
		byCampaign.set(key, acc);
	}

	// Previous window, reduced to just the rate per identity. Computed
	// with the same code path rather than a parallel one, so the two
	// windows cannot disagree about what a blind session is.
	const previousRate = new Map<string, number>();
	if (options.previous && options.previous.length > 0) {
		const prev = buildTrafficStatement(options.previous, {
			...options,
			previous: null,
			// Same floor, so a campaign too small to judge now is also
			// too small to have been judged then.
			minSessions: floor,
		});
		for (const c of prev.campaigns) {
			previousRate.set(c.platformId ?? c.name, c.arrivedBlindPct);
		}
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
			// Two gates, not one. The relative gate alone was circular,
			// and a reviewer who audits financial statements for a
			// living named it as the weakest sentence on the page:
			// "sempre vai ter alguem acima da propria media. Uma conta
			// impecavel, com 60% de abandono em tudo, ainda vai gerar
			// cinco linhas de desperdicio aqui." Correct. So a row must
			// now be bad in absolute terms AND unusual for this
			// account, which means a healthy account can and should
			// produce an empty table.
			const unusual = points >= 10;
			const bad = blindPct >= ABSOLUTE_BLIND_FLOOR;
			const verdict: CampaignRow["verdict"] =
				blindPct >= IMPLAUSIBLE_BLIND_PCT
					? "medicao_suspeita"
					: unusual && bad
						? // Pausing is only advice when pausing is free. A
							// campaign that still completes purchases gets
							// told to be fixed, never cut.
							c.completed > 0
							? "corrigir"
							: "cortar"
						: points >= 3
							? "observar"
							: "entregando";
			const topLanding =
				[...c.landing.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
			const spend =
				c.platformId && options.spendByCampaignId
					? options.spendByCampaignId.get(c.platformId) ?? null
					: null;
			const devRow = (k: "mobile" | "desktop") => {
				const d = c.dev.get(k);
				// Was 50, which is why the split showed on one row of
				// fifteen: nearly all this traffic is mobile, so desktop
				// almost never cleared it. Eight reviewers asked for the
				// split on every row and three called it the most
				// actionable thing on the page. 30 is still enough to
				// avoid a wrong conclusion about a device, and the
				// session count travels with the rate so the reader can
				// discount a thin one.
				if (!d || d.n < 30) return null;
				return {
					sessions: d.n,
					blind: d.blind,
					blindPct: Math.round((1000 * d.blind) / d.n) / 10,
				};
			};
			const prevPct = previousRate.get(c.platformId ?? c.name) ?? null;
			return {
				previousBlindPct: prevPct,
				deltaPoints:
					prevPct === null ? null : Math.round((blindPct - prevPct) * 10) / 10,
				mobileSharePct: Math.round(
					(1000 * (c.dev.get("mobile")?.n ?? 0)) / c.sessions,
				) / 10,
				byDevice: { mobile: devRow("mobile"), desktop: devRow("desktop") },
				spendBrl: spend,
				spendWastedBrl:
					spend === null ? null : Math.round((spend * c.blind) / c.sessions),
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
			purchases: above.reduce((n, c) => n + c.completed, 0),
			spendBrl: campaigns.some((c) => c.spendBrl !== null)
				? campaigns.reduce((n, c) => n + (c.spendBrl ?? 0), 0)
				: null,
			spendWastedBrl: campaigns.some((c) => c.spendWastedBrl !== null)
				? campaigns.reduce((n, c) => n + (c.spendWastedBrl ?? 0), 0)
				: null,
		},
		belowFloor: {
			campaigns: below.length,
			sessions: below.reduce((n, c) => n + c.sessions, 0),
		},
		landingPages: [...byPage.entries()]
			.filter(([, p]) => p.sessions >= floor)
			.map(([path, p]) => ({
				path,
				sessions: p.sessions,
				arrivedBlind: p.blind,
				arrivedBlindPct: Math.round((1000 * p.blind) / p.sessions) / 10,
				campaigns: p.campaigns.size,
				purchases: p.purchases,
			}))
			.sort((a, b) => b.arrivedBlind - a.arrivedBlind),
		// 300 to match the per-campaign floor: below it the rate is noise
		// and a noisy control is worse than none.
		control:
			controlSessions >= 300
				? {
						sessions: controlSessions,
						blind: controlBlind,
						blindPct: Math.round((1000 * controlBlind) / controlSessions) / 10,
						excludedPaidMarker: controlExcluded,
					}
				: null,
	};
}
