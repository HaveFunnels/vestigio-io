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

/**
 * Below this a rate is not a rate, it is a handful of visits.
 *
 * Was 300, and six of nine reviewers hit it in every round. It was not
 * statistical rigour, it was a choice of customer wearing rigour as a
 * costume: it left 42% of the measured account outside the campaign
 * table, 100% of the accountant's campaigns, and all eight of the
 * dentist's. "Vocês me dão certeza sobre o que eu já sabia e me deixam
 * no escuro onde eu ainda não sei."
 *
 * The honest way to lower it is not to relax the gate, it is to carry
 * the uncertainty. A small campaign still gets a rate, the rate still
 * gets a margin, and the VERDICT requires the pessimistic end of that
 * margin to clear the bar. A thin row can therefore still be called
 * out, but only when it is extreme enough that even the cautious
 * reading condemns it. The media buyer settled the trade: "prefiro
 * número com aviso de incerteza do que ausência de número."
 */
export const MIN_SESSIONS_PER_CAMPAIGN = 80;

/**
 * Half-width of the 95% interval for a proportion, in points.
 *
 * Plain Wald, which is good enough at these sizes and, more
 * importantly, is a formula the customer who audits statements can
 * reproduce on paper. A cleverer interval that nobody can check would
 * trade the one property that makes this better than a generated
 * paragraph.
 */
export function marginOfError(pct: number, n: number): number {
	if (n <= 0) return 100;
	const p = Math.min(1, Math.max(0, pct / 100));
	return Math.round(100 * 1.96 * Math.sqrt((p * (1 - p)) / n) * 10) / 10;
}

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
/**
 * Which definition of "did nothing" is in force.
 *
 * Bump this whenever `sawNothing` changes. It is stamped on every
 * rollup row so a series never silently compares two rulers: the
 * headline already moved from 70.1% to 29.5% once, with the verdict
 * inverting on the same account, and nothing recorded that the
 * measurement had changed underneath. The reviewer who audits
 * financial statements caught exactly that and said a delta only means
 * something if both sides used the same ruler. He is right, and it is
 * impossible to reconstruct after the fact.
 *
 * 1 = no scroll past 25%.
 * 2 = no interaction of any kind (current).
 */
export const RULER_VERSION = 2;

/**
 * The absolute gate, in points.
 *
 * Deliberately a constant and not a multiple of the account's own
 * baseline, because the whole purpose of the second gate is to be
 * independent of the first: a relative gate alone is circular, since
 * someone is always above their own median. The CFO read 45 next to a
 * baseline of 29.5 and asked where it came from, which was fair,
 * because nothing on the page said it was a constant. It is now
 * shipped in `thresholds` and printed, so the two rules in the same
 * sentence are visibly two rules.
 */
export const ABSOLUTE_BLIND_FLOOR = 45;

/** How far above the account's own median a row has to sit before it
 *  counts as unusual for this account rather than ordinary for it. */
export const POINTS_ABOVE_MEDIAN = 10;

/** Session floor for a search term. Lower than a campaign's, because a
 *  term is long-tail by nature and the campaign floor would empty the
 *  view entirely. */
export const MIN_SESSIONS_PER_TERM = 60;

/** Above this a rate stops being plausible behaviour and starts
 *  looking like broken measurement, so the row says so instead of
 *  recommending a cut. Four reviewers read the old 99.8% and 100%
 *  rows as instrumentation error rather than waste, and they were
 *  right: both were desktop sessions whose scroll never fired. */
export const IMPLAUSIBLE_BLIND_PCT = 90;

/**
 * How much of a page's judged traffic has to degrade before the page
 * itself is the defendant.
 *
 * The statement already made this distinction in prose and refused to
 * act on it: "quando quase todas perdem no mesmo lugar, o alvo e a
 * pagina". Promoting it to a verdict is what the second council asked
 * for, and it needed a number instead of "quase todas".
 *
 * Measured on the instrumented account, the three cases separate
 * cleanly: 57 of 65 campaigns degrade on the worst page (88%), 11 of
 * 27 on the second (41%), and 1 of 41 on a page that works (2%). Two
 * thirds sits in the gap with room on both sides.
 */
export const PAGE_COMMON_FACTOR_SHARE = 0.66;

/**
 * How far above the pooled account rate a page has to sit, on the
 * cautious end, before it is a defendant.
 *
 * A page does NOT get judged against ABSOLUTE_BLIND_FLOOR, and the
 * reason is arithmetic rather than taste. A page pools every campaign
 * that lands on it, good and bad, so its rate is dragged toward the
 * account mean by construction. The worst page in the instrumented
 * account carries 71.6% of all the waste in the account and still
 * reads 36.3%, which never clears a floor of 45. Reusing the campaign
 * floor here does not make the page verdict strict, it makes the page
 * verdict never fire, which I shipped and caught only by running it
 * against real data.
 *
 * That is the fourth time the same defect has appeared in this file:
 * a threshold written for one unit applied to another. The first three
 * were the scroll proxy, the service-business action, and the cost of
 * pausing.
 *
 * 5 points matches the materiality floor the weekly alert and the
 * scoreboard already use, so the three cannot disagree about what
 * counts as a real difference.
 */
export const PAGE_POINTS_ABOVE_POOL = 5;

/**
 * How much of the account's total waste a page has to hold before it
 * is worth a verdict.
 *
 * This is the gate that keeps the decision card pointed at money
 * rather than at rates, which is the single thing the second council
 * asked for. A page can be genuinely bad and still be irrelevant: the
 * fix costs the same whether the page holds 2% or 70% of the waste,
 * and only one of those is worth the operator's Monday.
 */
export const PAGE_MIN_WASTE_SHARE = 15;

/**
 * The fewest paid sessions an account-wide condemnation can rest on.
 *
 * The margin of error already stops us overclaiming the RATE: at 60
 * sessions the half-width is 12 points and the pessimistic end has to
 * clear the floor anyway. What the margin does not protect is whether
 * the window is REPRESENTATIVE at all, which is a different question
 * and the one that matters when a handful of odd sessions is the whole
 * sample.
 *
 * Set above MIN_SESSIONS_PER_CAMPAIGN on purpose. We refuse to judge a
 * single campaign on fewer than 80 sessions, so condemning an entire
 * account on 60 would be incoherent, and an account-level figure pools
 * every campaign by construction and therefore should be held to more
 * rather than less.
 *
 * Found by measuring the floor rather than by reasoning about it: the
 * rule fired happily at 60 sessions until this existed.
 */
export const MIN_SESSIONS_FOR_ACCOUNT_VERDICT = 150;

/**
 * Days of silence after which a campaign is treated as no longer
 * running, and therefore not something to recommend an action on.
 *
 * Found by checking the live account rather than by reasoning: 186 of
 * 357 campaigns with traffic in a 28 day window had brought none for
 * two weeks or more, and 123 of them had brought traffic on exactly
 * one day, totalling 1.329 sessions between them. Those are shared
 * links and residual fbclids, not campaigns.
 *
 * Two separate harms came out of treating them as live, and the second
 * is worse than the first:
 *
 *   1. Two of six action verdicts on the real account told the
 *      operator to cut campaigns that had already stopped 18 and 20
 *      days earlier. Advice nobody can act on, about money nobody is
 *      spending.
 *   2. Three weeks later the scoreboard would have read the vanished
 *      traffic as the operator following our advice and scored both as
 *      hits. We would have taken credit for campaigns that were off
 *      before we spoke, inflating our own published hit rate with free
 *      wins. That is precisely the self-flattery the scoreboard exists
 *      to prevent, and it would have been its most embarrassing
 *      possible failure.
 *
 * 14 days rather than 7: a thin campaign can go quiet over a weekend
 * or a slow week without being off, and the cost of waiting is one
 * cycle of silence while the cost of being wrong is a false
 * recommendation.
 */
export const DAYS_SILENT_BEFORE_STOPPED = 14;

/**
 * How likely a false zero has to be before a zero purchase count stops
 * counting as evidence that pausing is free.
 *
 * Two council members computed this independently and both landed in
 * the same place. The account converts at roughly 1,8% of paid
 * sessions. At the 80 session floor the expected number of purchases
 * is about 1,4, so the chance of observing zero by sampling alone is
 * around 24%, and conditioned on a campaign also clearing both waste
 * gates it rises further, because clearing them means most of its
 * traffic did nothing and only the remainder could have converted.
 *
 * The product applies a 95% interval to the variable that decides
 * nothing and a threshold of exactly zero to the variable that decides
 * whether the operator kills or fixes the campaign. This is the fix:
 * if a campaign converting at the account rate would show zero
 * purchases this often, the zero is not evidence and the verdict
 * degrades to "corrigir".
 */
export const MAX_FALSE_ZERO_RISK = 0.1;

/**
 * Checkout reach above this share makes "cortar" unavailable.
 *
 * A campaign that fills the checkout and closes nothing is not a
 * traffic problem, it is a payment problem, and in Brazilian DR with
 * Pix and boleto it is the largest recoverable cohort in the account.
 * Cutting it discards qualified demand and hides a fixable leak.
 */
export const CHECKOUT_REACH_BLOCKS_CUT = 0.02;

/**
 * Below this many judged campaigns on a page, the share above is one
 * or two campaigns wearing a percentage. 2 of 2 is 100% and means
 * nothing.
 */
export const MIN_CAMPAIGNS_FOR_PAGE_VERDICT = 3;

export function sawNothing(a: Record<string, unknown>): boolean {
	if (num(a.max_scroll_depth) >= SAW_SOMETHING_MILESTONE) return false;
	// A call to action entered the viewport. On a page whose CTA sits
	// above the fold, this is exactly what a converting visit looks
	// like without a single scroll event.
	if (num(a.cta_viewed_count) > 0) return false;
	// Reached the action that matters, by any of the models.
	if (a.form_started || a.checkout_reached || a.support_opened) return false;
	if (a.handoff_started || a.reached_thank_you || a.form_completed) return false;
	// Reached for the phone, WhatsApp or a Direct message. For the
	// businesses that close off the site this is the ONLY thing a
	// converting visit leaves behind, and counting it as "saw nothing"
	// was the inversion six reviewers named.
	if (a.contact_started) return false;
	if (Array.isArray(a.contact_channels) && a.contact_channels.length > 0) return false;
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
	/**
	 * When the session started, used ONLY to tell whether a campaign is
	 * still running.
	 *
	 * Optional because most callers and every older fixture do not
	 * supply it. Without it a campaign is treated as running, which is
	 * the safe default: it keeps the old behaviour rather than silently
	 * marking every campaign stopped.
	 */
	startedAt?: Date;
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
	/**
	 * The label to print: the name shortened, and disambiguated when
	 * another campaign in this window carries the same one.
	 *
	 * Two rows on the instrumented account are not merely similar, they
	 * are byte-identical: "(1-3-X | H1-H4/C1 | POTE) aberto adv+
	 * (29/08) — Cópia" six times over, twice, under different campaign
	 * ids. Printing that label twice hands the operator two rows they
	 * cannot tell apart, which is worse than a long name. The id tail
	 * is what the ad manager itself shows, so it is what lets them find
	 * the right one.
	 */
	displayName: string;
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
	verdict: "cortar" | "corrigir" | "observar" | "entregando" | "medicao_suspeita" | "parada";
	/**
	 * Days since this campaign last brought a session, or null when the
	 * caller did not supply session dates.
	 *
	 * A campaign silent for DAYS_SILENT_BEFORE_STOPPED days gets the
	 * "parada" verdict instead of an action, because there is nothing
	 * to act on and because scoring it later would hand us a free win.
	 */
	/**
	 * Why a cut was withheld, or null when a cut was available.
	 *
	 * Printed rather than kept internal, because "we are not telling
	 * you to cut this, and here is why" is a more useful sentence than
	 * a quieter verdict with no explanation.
	 */
	cutUnsafeReason:
		| "medicao_de_compra_quebrada"
		| "chega_ao_checkout"
		| "zero_nao_e_evidencia"
		| null;
	/** How often a campaign converting at the account rate would show
	 *  zero purchases at this sample size, as a percentage. */
	falseZeroRiskPct: number;
	daysSinceLastSession: number | null;
	/** Distinct days this campaign brought traffic in the window. One
	 *  day and a handful of sessions is a shared link, not a campaign. */
	activeDays: number;
	/** Percentage points above the account median. Negative is better. */
	pointsAboveAccount: number;
	/**
	 * Half-width of the 95% interval on `arrivedBlindPct`, in points.
	 *
	 * Shipped on every row, not only thin ones, because a reader who
	 * sees it sometimes learns to distrust its absence. A campaign with
	 * 2.000 sessions carries a small margin and says so.
	 */
	marginPoints: number;
	/** The pessimistic end of the interval, which is what the verdict
	 *  is allowed to act on. */
	blindPctLow: number;
	/**
	 * What pausing costs, in the unit this business actually earns in.
	 *
	 * This used to be purchases only, and purchases means
	 * reached_thank_you, which a lawyer, an accountant and a dentist do
	 * not have because they have no checkout. So for every service
	 * business the column read zero, "pausar não custa compra nenhuma"
	 * was always true, and the verdict was always "cortar". The product
	 * told them to cut the campaign that brought their leads and
	 * claimed it was free.
	 *
	 * The accountant on the council found it from the other end,
	 * without seeing the code: "no meu escritório não existe compra.
	 * Existe ligação, existe WhatsApp aberto, e existe contrato
	 * assinado. Contar direito o proxy errado não é melhor que escrever
	 * com IA, é só errado com mais casas decimais."
	 *
	 * So the cost is now named in the unit the model earns in, and the
	 * verdict reads whichever one applies.
	 */
	pauseCostUnit: "compras" | "contatos";
	/** The count in that unit. */
	pauseCost: number;
	/** What pausing this campaign costs: the action-reaches and the
	 *  purchases it still produced. The statement's only suggested
	 *  action is to pause, and it used to not price that action, so the
	 *  operator had to trust a verdict blind. On the live account the
	 *  six waste campaigns together carry 4% of all purchases against
	 *  13% of all sessions, which is a good trade, but it is only a
	 *  good trade because the numbers are on the page. */
	pauseCostActions: number;
	pauseCostPurchases: number;
	/** Sessions from this campaign that tried to reach a human. Counted
	 *  for every business model, including a store's, where it is
	 *  support rather than a sale and therefore worth seeing separately
	 *  from the checkout number. */
	contactSessions: number;
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
	/**
	 * The account's own MEDIAN per-campaign rate. The comparison basis,
	 * and the right one for "is this campaign unusual here".
	 *
	 * Not the same thing as the account's overall rate, and the page
	 * used to describe it as if it were: it printed this number under
	 * the words "na conta inteira", which names a pooled rate. On the
	 * instrumented account the median is 29.5% and the pooled rate is
	 * 26.1%. The CFO tried to reconcile the headline against the
	 * per-page table, could not, and reported it as an arithmetic
	 * error. It was not: the number was right and the sentence was
	 * wrong, which is worse, because checking the arithmetic cannot
	 * find it. That is exactly what happened to him.
	 */
	accountMedianBlindPct: number;
	/** The account's pooled rate: blind sessions over all attributed
	 *  sessions. This is what "na conta inteira" actually means. */
	accountBlindPct: number;
	/**
	 * Paid clicks that never became a readable session: fewer than
	 * MIN_EVENTS_INTERACTIVE events, so no scroll, no CTA on screen,
	 * nothing. Counted and reported instead of silently dropped.
	 *
	 * Deliberately NOT part of accountBlindPct. On the live account
	 * these are 18,3% of paid sessions and 93,9% of them carry an
	 * fbclid, so they are real clicks the advertiser paid for. But
	 * their device profile is inverted against the counted population
	 * (81% plain browser against 24%, where Meta paid traffic is 75%
	 * in-app webview), so folding them into the rate the verdicts are
	 * calibrated on would move every threshold without a decision.
	 *
	 * The honest reading: a separate finding, owned by page delivery
	 * rather than by ad targeting.
	 */
	notLoaded: {
		sessions: number;
		/** Of those, how many carry a paid click marker. */
		withPaidMarker: number;
		/** Share of all paid sessions, counted and uncounted. */
		sharePct: number;
	};
	/**
	 * Set when the conversion measurement itself looks broken, in which
	 * case no campaign may be told to cut.
	 *
	 * The trigger that matters: the account records zero purchases
	 * while sessions do reach the checkout. That is the signature of a
	 * thank-you page the classifier cannot see, and the classifier is a
	 * URL regex that does not match "sucesso", "pedido-realizado" or
	 * "compra-aprovada". A store confirming at /sucesso measures zero
	 * purchases, which makes the cost of pausing zero on every campaign,
	 * which makes every qualifying campaign a cut. That is the same
	 * defect already fixed once for service businesses, left open for
	 * commerce by spelling, and nothing detected it.
	 */
	conversionSuspect: {
		blocked: boolean;
		reason: string | null;
		purchases: number;
		checkoutReached: number;
	};
	/**
	 * Set only when the account is bad everywhere and therefore nothing
	 * individual stands out.
	 *
	 * The honest output for an account whose every campaign sits at its
	 * own median: the defendant is the account, not a line in it. Null
	 * on any account where a campaign or a page was named, so this can
	 * never be a second opinion competing with a specific one.
	 */
	accountVerdict: {
		blindPctLow: number;
		marginPoints: number;
		/** Non-paid traffic on the same site, when there is enough of it
		 *  to compare against. The one reference internal spread cannot
		 *  hide anything from. */
		controlPct: number | null;
		gapPoints: number | null;
		campaignsJudged: number;
	} | null;
	/**
	 * The numbers the verdict actually used, so the page can declare
	 * its method without the text drifting from the behaviour.
	 *
	 * A reviewer who audits financial statements returned the document
	 * over undeclared criteria, and the same reviewer would have
	 * returned it again over a declaration that no longer matched the
	 * code. Shipping the thresholds makes that impossible.
	 */
	thresholds: {
		absoluteBlindPct: number;
		pointsAboveMedian: number;
		implausibleBlindPct: number;
		minSessions: number;
		minEvents: number;
	};
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
	/**
	 * Paid sessions that tried to reach a human, by channel.
	 *
	 * The esthetician's question verbatim, and she had exactly one:
	 * "quantas mensagens cada anúncio me trouxe". Her conversion is
	 * 100% WhatsApp and she does not really have a site, so until this
	 * existed the statement could say nothing at all about her
	 * business.
	 *
	 * phone_copy is listed separately and deliberately: it is weaker
	 * evidence than a tap, because copying a number is intent to call
	 * and not a call. See the note on what cannot be measured.
	 */
	contactsByChannel: { channel: string; sessions: number }[];
	/**
	 * Paid traffic grouped by the search term, when the platform passes
	 * one. Empty for a feed advertiser, which is every account measured
	 * so far. This is the line that separates a buyer from a browser
	 * inside a single campaign, and it is the question the two
	 * search-only reviewers arrived with.
	 */
	searchTerms: {
		term: string;
		sessions: number;
		arrivedBlind: number;
		arrivedBlindPct: number;
		reachedAction: number;
		purchases: number;
		campaigns: number;
	}[];
	landingPages: {
		path: string;
		sessions: number;
		arrivedBlind: number;
		arrivedBlindPct: number;
		/** How many distinct campaigns sent traffic here. */
		campaigns: number;
		purchases: number;
		/**
		 * Of the campaigns on this page that cleared the session floor,
		 * how many sit above the account median.
		 *
		 * This is what separates "the page does not serve bought
		 * traffic" from "one ad is lying". If every campaign landing
		 * here degrades, the common factor is the page; if only some
		 * do, the others prove the page can convert and the difference
		 * is upstream.
		 *
		 * The distinction exists because the reviewer spending R$ 220k
		 * a month caught the statement contradicting its own control:
		 * it concluded "o alvo é a página" while printing that non-paid
		 * traffic does nothing only 4.4% of the time on those same
		 * pages. If the page were broken, organic would break too. What
		 * is broken is the pairing, and the page cannot be blamed
		 * without saying which half.
		 */
		campaignsAboveMedian: number;
		campaignsJudged: number;

		/**
		 * Of the campaigns on this page, how many do worse than the
		 * typical campaign landing SOMEWHERE ELSE on this site.
		 *
		 * This is the number the page verdict is actually built on, and
		 * it exists separately from campaignsAboveMedian because the
		 * screen has to justify the verdict with the number that
		 * produced it. Explaining a conclusion with a different
		 * statistic than the one that reached it is the harder class of
		 * defect, since checking the arithmetic cannot find it.
		 */
		campaignsDegrading: number;
		/** Null when every judged campaign lands on this page, which is
		 *  when blame cannot be apportioned at all. */
		elsewhereMedianPct: number | null;

		/**
		 * What to do about this page.
		 *
		 * Deliberately NOT the campaign vocabulary. A page cannot be
		 * cut, because there is nothing to pause: the traffic would
		 * simply land somewhere else. Reusing "cortar" here would
		 * recreate the defect that has now shipped three times in
		 * different clothes, a verb written for a store applied to a
		 * thing that does not work like one.
		 *
		 * "anuncio_errado" is the verdict that did not exist before and
		 * is the most useful of the five: the page clears the floor on
		 * waste, but only a minority of campaigns landing here degrade,
		 * so the others prove the page converts and the defendant is
		 * upstream.
		 */
		verdict: "corrigir" | "anuncio_errado" | "observar" | "entregando" | "medicao_suspeita";
		/** 95% half-width on this page's rate. */
		marginPoints: number;
		/** The cautious end of the rate, which is what the verdict acts
		 *  on, exactly as the campaign verdict does. */
		blindPctLow: number;
		/**
		 * This page's mute visits as a share of every mute visit in the
		 * account, 0 to 100.
		 *
		 * This is the page's magnitude, and it is deliberately NOT a
		 * projection of recoverable purchases. Multiplying mute visits
		 * by the rate at which engaged visits convert would assert that
		 * a visitor who did nothing would have bought like a visitor
		 * who did something, which is false by construction: the visit
		 * is mute precisely because it did not engage. Every analytics
		 * product makes that multiplication because it produces a
		 * bigger number. This one states what was counted.
		 */
		wasteShare: number;
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
	// Truncate the MIDDLE, not the tail. The distinguishing part of
	// these names is the date at the end: cutting from the right turned
	// "...aberto adv+ (29/08)" and "...aberto adv+ (21/09)" into the
	// same label. A reviewer proposed exactly this, "corta no meio,
	// mostra o começo e o fim".
	if (base.length > 46) {
		// Cut at a word boundary, not mid-token. The second council
		// read "(1-3-X | v1-v10/C1 | POTE) abe…v+ 55+ (21/09)" off the
		// live account and could not tell five rows apart.
		//
		// Worth being precise about what was and was not wrong there,
		// because the obvious fix is the wrong one. Truncating from the
		// middle is CORRECT: the date at the tail is what distinguishes
		// these names, and an earlier right-truncation collapsed
		// "(29/08)" and "(21/09)" into the same label. And what the
		// middle cut eats here, "aberto adv", is common to every row
		// anyway. The only real defect is the ragged "abe", which costs
		// nothing to fix and makes the label readable.
		const head = base.slice(0, 30);
		const cut = head.lastIndexOf(" ");
		base =
			(cut >= 18 ? head.slice(0, cut) : head.trimEnd()) +
			"…" +
			base.slice(-14).replace(/^\S*\s/, "").trimStart();
	}
	return copies > 0 ? `${base} (cópia ${copies})` : base;
}

/**
 * The search term the visitor typed, when the ad platform passes it.
 *
 * Two reviewers whose entire budget is Google search named the same
 * question as the one they came with, and neither could answer it from
 * a campaign-level table. The lawyer: someone searching "calculo de
 * rescisao gratis" becomes a free consultation and never a contract,
 * while someone searching "entrar com acao contra empresa" signs. The
 * parts distributor: a mechanic searches the exact part number, a
 * browser searches "pastilha de freio preco". In both cases the two
 * live inside ONE campaign and cancel each other out when aggregated,
 * which is why the campaign row could not answer it.
 *
 * No pixel change is needed. Google Ads' own ValueTrack convention
 * puts the keyword in utm_term, and the pixel already stores the whole
 * landing URL, query string included. So the term is read out of data
 * that has been collected all along.
 *
 * Returns null when the URL carries no term, which is every session on
 * the only instrumented account today: it runs Meta and TikTok, and
 * neither passes one. Verified against 3.000 real landing URLs from
 * that account, where the parser correctly finds nothing rather than
 * inventing a term from the path.
 */
export function searchTermOf(landingUrl: unknown): string | null {
	if (typeof landingUrl !== "string" || landingUrl.length === 0) return null;
	const q = landingUrl.indexOf("?");
	if (q < 0) return null;
	let params: URLSearchParams;
	try {
		params = new URLSearchParams(landingUrl.slice(q + 1));
	} catch {
		return null;
	}
	// Deliberately NOT "q". A Shopify storefront puts its own site
	// search in ?q=, and it is present in this account's real URLs.
	// Reading it as an ad keyword would invent search terms for a
	// store that buys no search traffic at all.
	for (const key of ["utm_term", "utm_keyword", "keyword"]) {
		const raw = params.get(key);
		if (!raw) continue;
		// ValueTrack leaves the macro literal in place when the account
		// is misconfigured, and "{keyword}" is not a term anyone typed.
		if (/^\{.*\}$/.test(raw.trim())) return null;
		const term = decodeCampaignName(raw).toLowerCase().replace(/\s+/g, " ").trim();
		if (term.length === 0) return null;
		return term;
	}
	return null;
}

// ──────────────────────────────────────────────
// What moved.
//
// The lowest score in sixteen of the twenty reviews was
// `pagaria_de_novo_mes2`, and the reason was identical every time:
// month one hands over an architectural finding, month two hands over
// the same table. "Não porque é ruim. Porque não chega na hora da
// decisão."
//
// They did not ask for more analysis. They asked for the one sentence
// a snapshot cannot say. The supplements founder wrote the spec
// himself: "a campanha X estava em 83% e está em 91%, nada mudou no
// criativo". He also noticed the data was already there, in the
// month-over-month column, "só está no lugar errado, no formato errado
// e na frequência errada".
//
// So this is the same measurement read over a shorter stride and
// filtered down to what actually changed. A week against the week
// before, which is short enough to act on and long enough to clear
// the noise a 48-hour window carries.
// ──────────────────────────────────────────────

/** Session floor for one side of a week-over-week comparison. Lower
 *  than a campaign's monthly floor because the window is a quarter as
 *  long; a move is only reported when BOTH weeks clear it, so the
 *  comparison always rests on two real samples. */
export const MIN_SESSIONS_PER_MOVE = 100;

/**
 * The smallest move worth a message, in points, regardless of how
 * certain it is.
 *
 * A fixed threshold alone was wrong in both directions and the test
 * suite caught it with the reviewer's own example. He asked for "a
 * campanha X estava em 83% e está em 91%", which is 8 points, and a
 * flat 10-point gate would have missed the exact case he specified.
 * Meanwhile at the 100-session floor a 10-point move is barely one
 * standard error and reporting it would be noise.
 *
 * So a move has to be both SIGNIFICANT and MATERIAL. Significance
 * comes from the two sample sizes; this constant is the materiality
 * floor, so a very large account does not get told about a 1-point
 * drift that happens to be statistically certain.
 */
export const MOVE_POINTS = 5;

/** How many standard errors of the difference a move must clear.
 *  2.5 is roughly a 99% two-sided interval, which is the right
 *  asymmetry for something that interrupts someone's week. */
export const MOVE_SIGMA = 2.5;

/**
 * Standard error of the difference between two proportions, in points.
 *
 * Why this and not a fixed gate: at 400 sessions a week an 8-point
 * move is 3.4 standard errors and real; at 100 sessions the same 8
 * points is 1.4 and indistinguishable from chance. One threshold
 * cannot serve both, and the operator of a small account is exactly
 * the person who cannot afford a false alarm.
 */
export function moveStandardError(
	pctA: number,
	nA: number,
	pctB: number,
	nB: number,
): number {
	if (nA <= 0 || nB <= 0) return Number.POSITIVE_INFINITY;
	const a = (pctA / 100) * (1 - pctA / 100);
	const b = (pctB / 100) * (1 - pctB / 100);
	return 100 * Math.sqrt(a / nA + b / nB);
}

export interface TrafficMove {
	kind: "campaign" | "page" | "term";
	/** Already display-ready: the shortened campaign label, the path,
	 *  or the term as typed. */
	label: string;
	nowPct: number;
	beforePct: number;
	/** Positive is worse, because the metric counts people who did
	 *  nothing. */
	deltaPoints: number;
	nowSessions: number;
	beforeSessions: number;
	direction: "worse" | "better";
	/**
	 * The campaign still lands on the same page it landed on last week.
	 *
	 * This is what makes "nothing changed but the number" a statement
	 * the operator can check rather than a claim they have to take on
	 * faith. Only meaningful for a campaign move.
	 */
	samePage: boolean;
	/** Purchases in the current week, so a message never recommends
	 *  touching something without saying what it still earns. */
	purchases: number;
	/**
	 * Where this landed, for a campaign move. Carried so a caller can
	 * notice that several campaigns moved the same way on the same
	 * page, which is the ad-or-page question asked of a change instead
	 * of a level. Three reviewers named that section the best thing on
	 * the statement.
	 */
	path: string | null;
}

/**
 * Several campaigns moving the same way on the same page is one fact,
 * not several.
 *
 * Measured on the live account: the three moves detected in a real
 * week were three members of one campaign family, all worsening, all
 * landing on the same product page. Reporting them as three
 * independent problems invites three investigations of one cause.
 */
export function sharedPageMove(
	moves: TrafficMove[],
): { path: string; count: number; direction: "worse" | "better" } | null {
	const byPath = new Map<string, TrafficMove[]>();
	for (const m of moves) {
		if (m.kind !== "campaign" || !m.path) continue;
		const list = byPath.get(m.path) ?? [];
		list.push(m);
		byPath.set(m.path, list);
	}
	let best: { path: string; count: number; direction: "worse" | "better" } | null = null;
	for (const [path, list] of byPath) {
		if (list.length < 2) continue;
		// Only when they agree. Two campaigns moving in opposite
		// directions on one page is not a page story.
		const worse = list.filter((m) => m.direction === "worse").length;
		if (worse !== list.length && worse !== 0) continue;
		if (!best || list.length > best.count) {
			best = { path, count: list.length, direction: worse === list.length ? "worse" : "better" };
		}
	}
	return best;
}

/**
 * Diff two statements built over adjacent windows of equal length.
 *
 * Pure: takes the two results, never the sessions. That keeps it
 * testable and keeps the one definition of a blind session in one
 * place, since both sides came through `buildTrafficStatement`.
 */
export function detectTrafficMoves(
	now: TrafficStatement,
	before: TrafficStatement,
	options?: { minSessions?: number; minPoints?: number; sigma?: number },
): TrafficMove[] {
	const minSessions = options?.minSessions ?? MIN_SESSIONS_PER_MOVE;
	const minPoints = options?.minPoints ?? MOVE_POINTS;
	const sigma = options?.sigma ?? MOVE_SIGMA;
	const moves: TrafficMove[] = [];

	const push = (
		kind: TrafficMove["kind"],
		label: string,
		a: { pct: number; sessions: number },
		b: { pct: number; sessions: number },
		extra: { samePage: boolean; purchases: number; path: string | null },
	) => {
		if (a.sessions < minSessions || b.sessions < minSessions) return;
		const delta = Math.round((a.pct - b.pct) * 10) / 10;
		// Material, then significant. Both gates, in that order,
		// because the cheap check is the one that rejects most rows.
		if (Math.abs(delta) < minPoints) return;
		const se = moveStandardError(a.pct, a.sessions, b.pct, b.sessions);
		if (Math.abs(delta) < sigma * se) return;
		moves.push({
			kind,
			label,
			nowPct: a.pct,
			beforePct: b.pct,
			deltaPoints: delta,
			nowSessions: a.sessions,
			beforeSessions: b.sessions,
			direction: delta > 0 ? "worse" : "better",
			...extra,
		});
	};

	const beforeCampaigns = new Map(before.campaigns.map((c) => [c.platformId ?? c.name, c]));
	for (const c of now.campaigns) {
		const was = beforeCampaigns.get(c.platformId ?? c.name);
		if (!was) continue;
		push(
			"campaign",
			c.displayName,
			{ pct: c.arrivedBlindPct, sessions: c.sessions },
			{ pct: was.arrivedBlindPct, sessions: was.sessions },
			{
				samePage:
					c.topLandingPath !== null && c.topLandingPath === was.topLandingPath,
				purchases: c.pauseCostPurchases,
				path: c.topLandingPath,
			},
		);
	}

	// A page carrying exactly one campaign that already moved is the
	// same fact stated twice. Three reviewers read a sentence repeated
	// verbatim as template rather than analysis, and this would be the
	// same mistake in a new place.
	const movedCampaignPaths = new Set(
		now.campaigns
			.filter((c) => moves.some((m) => m.kind === "campaign" && m.label === c.displayName))
			.map((c) => c.topLandingPath)
			.filter((p): p is string => p !== null),
	);
	const beforePages = new Map(before.landingPages.map((p) => [p.path, p]));
	for (const p of now.landingPages) {
		const was = beforePages.get(p.path);
		if (!was) continue;
		if (p.campaigns === 1 && movedCampaignPaths.has(p.path)) continue;
		push(
			"page",
			p.path,
			{ pct: p.arrivedBlindPct, sessions: p.sessions },
			{ pct: was.arrivedBlindPct, sessions: was.sessions },
			{ samePage: true, purchases: p.purchases, path: p.path },
		);
	}

	const beforeTerms = new Map(before.searchTerms.map((t) => [t.term, t]));
	for (const t of now.searchTerms) {
		const was = beforeTerms.get(t.term);
		if (!was) continue;
		push(
			"term",
			t.term,
			{ pct: t.arrivedBlindPct, sessions: t.sessions },
			{ pct: was.arrivedBlindPct, sessions: was.sessions },
			{ samePage: true, purchases: t.purchases, path: null },
		);
	}

	// Worst first, and a worsening always outranks an equal-sized
	// improvement: the message exists to catch a leak, and the good
	// news is there so the page is not only ever bad news.
	return moves.sort((a, b) => b.deltaPoints - a.deltaPoints);
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

/** Which channels this session used to reach a human. */
function channelsOf(a: Record<string, unknown>): string[] {
	return Array.isArray(a.contact_channels)
		? a.contact_channels.filter((c): c is string => typeof c === "string")
		: [];
}

/** Did the visitor try to reach a human, by any channel? */
function contacted(a: Record<string, unknown>): boolean {
	if (a.contact_started) return true;
	return Array.isArray(a.contact_channels) && a.contact_channels.length > 0;
}

/**
 * Did this session reach the action that matters?
 *
 * The service models used to read `handoff_started || support_opened`,
 * and both were wrong for the job. `handoff_started` means a CHECKOUT
 * handoff, which a lawyer does not have, and it is false on every
 * session ever measured. `support_opened` is classified off the label
 * text, so it counts a FAQ link and misses a WhatsApp button whose
 * label is the business's phone number.
 *
 * Six reviewers described the same visitor in six different
 * businesses: arrives, reads the first screen, taps WhatsApp or the
 * phone, and leaves. That visitor is the conversion, and the old
 * definition scored them zero.
 */
function reachedAction(a: Record<string, unknown>, model: string): boolean {
	switch (model) {
		case "form":
			// A lawyer gets a form submission OR a WhatsApp tap, and the
			// second is more common than the first. Both are the lead.
			return Boolean(a.form_started) || contacted(a);
		case "whatsapp":
		case "external":
			return (
				contacted(a) || Boolean(a.handoff_started) || Boolean(a.support_opened)
			);
		// 'checkout' and 'purchase' both mean the commerce path. A
		// store's contact click is support, not a sale, so it does not
		// count here.
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
		/**
		 * Spend per campaign, from a connected ad account.
		 *
		 * Keyed by the platform's campaign id AND by the lowercased
		 * campaign name, because the two platforms identify a campaign
		 * differently in the landing URL: Meta passes a numeric id that
		 * the pixel captures, Google Ads passes the name in utm_campaign
		 * and no id at all. Joining on the id alone meant spend could
		 * never appear for a Google advertiser, which is the entire
		 * budget of three of the twenty reviewers.
		 */
		spendByCampaignId?: Map<string, number> | null;
		/** Sessions from the previous window of equal length, for the
		 *  month-over-month comparison. Omitted on a first run. */
		previous?: StatementSessionInput[] | null;
	},
): TrafficStatement {
	const model = options.conversionModel ?? "checkout";
	// A store earns in completed purchases. Everyone else earns in
	// conversations that started, and has no thank-you page to fire.
	const isCommerce = model === "checkout" || model === "purchase";
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
		contacts: number;
		/** Sessions that reached the checkout, which is what makes
		 *  "pausar nao custa nada" unavailable: a campaign that fills
		 *  the checkout and closes nothing is a payment problem, not a
		 *  traffic problem. */
		checkout: number;
		/** Latest session seen for this campaign, or null when the
		 *  caller supplied no dates. Decides whether the campaign is
		 *  still running and therefore whether it can be recommended
		 *  on at all. */
		lastSeen: Date | null;
		/** Distinct calendar days this campaign brought traffic. */
		days: Set<string>;
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
	interface TermAcc {
		sessions: number;
		blind: number;
		action: number;
		purchases: number;
		campaigns: Set<string>;
	}
	const byTerm = new Map<string, TermAcc>();
	const contactsByChannel = new Map<string, number>();

	// Paid clicks that never became a readable session. See the gate
	// below for why these are counted separately rather than folded in.
	let notLoaded = 0;
	let notLoadedPaid = 0;
	const notLoadedByCampaign = new Map<string, number>();

	for (const row of rows) {
		// The gate used to `continue` here, deleting the session from
		// every count with no trace. Six of nine specialists on the
		// media-buying council flagged that independently, and the
		// measurement proved them right about the thing that matters:
		// 9.406 of 51.364 paid sessions on the live account fall under
		// the gate, and 93,9% of them carry an fbclid against 96,0% in
		// the counted population. They are paid clicks. The advertiser
		// paid for them and they produced a median of 1,9 second and
		// zero scroll in 9.405 of 9.406 cases.
		//
		// They are NOT folded into the mute rate, and that is a
		// deliberate choice rather than caution. Their device profile is
		// inverted against the counted population, 81% plain browser
		// against 24%, where real Meta paid traffic is 75% in-app
		// webview. Something about that population differs beyond
		// having done nothing, and silently averaging it into the rate
		// the verdicts are calibrated on would move every threshold
		// without anyone deciding to.
		//
		// So: counted, named, reported, and kept out of the ruler. The
		// honest reading is that this is a separate finding with a
		// different owner and a different fix, which is page delivery
		// rather than ad targeting.
		const tooFewEvents = row.eventCount < MIN_EVENTS_INTERACTIVE;

		const a = row.aggregate;
		const ft = (a.attribution as { first_touch?: Record<string, unknown> } | undefined)
			?.first_touch;
		const campaignRaw = typeof ft?.campaign === "string" ? ft.campaign : null;

		// The gate, applied here rather than before the attribution is
		// read, so a discarded session can still be attributed to the
		// campaign that paid for it.
		if (tooFewEvents) {
			notLoaded++;
			if (hasPaidMarker(ft)) notLoadedPaid++;
			if (campaignRaw) {
				const { name: nlName, platformId: nlId } = splitCampaignRef(campaignRaw);
				notLoadedByCampaign.set(
					nlId ?? nlName,
					(notLoadedByCampaign.get(nlId ?? nlName) ?? 0) + 1,
				);
			}
			continue;
		}
		measured++;
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
				contacts: 0,
				checkout: 0,
				// Liveness. Tracked here rather than derived later
				// because the raw session dates are only in scope at
				// this point.
				lastSeen: null as Date | null,
				days: new Set<string>(),
			};

		acc.sessions++;
		if (row.startedAt instanceof Date && !Number.isNaN(row.startedAt.getTime())) {
			if (!acc.lastSeen || row.startedAt > acc.lastSeen) acc.lastSeen = row.startedAt;
			acc.days.add(row.startedAt.toISOString().slice(0, 10));
		}
		const blind = sawNothing(a);
		if (blind) acc.blind++;
		const dev = deviceOf(row.userAgent);
		const dv = acc.dev.get(dev) ?? { n: 0, blind: 0 };
		dv.n++;
		if (blind) dv.blind++;
		acc.dev.set(dev, dv);
		acc.durations.push(num(a.session_duration_ms));
		if (reachedAction(a, model)) acc.action++;
		if (contacted(a)) acc.contacts++;
		if (a.checkout_reached) acc.checkout++;
		if (a.reached_thank_you) acc.completed++;
		for (const ch of channelsOf(a)) {
			contactsByChannel.set(ch, (contactsByChannel.get(ch) ?? 0) + 1);
		}
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

		// Term level, independent of the landing path: a search
		// advertiser can send twenty terms to one page, and the page
		// view would hide exactly the distinction they need.
		const term = searchTermOf(ft?.landing_url);
		if (term) {
			const tm = byTerm.get(term) ?? {
				sessions: 0,
				blind: 0,
				action: 0,
				purchases: 0,
				campaigns: new Set<string>(),
			};
			tm.sessions++;
			if (blind) tm.blind++;
			if (reachedAction(a, model)) tm.action++;
			if (a.reached_thank_you) tm.purchases++;
			tm.campaigns.add(key);
			byTerm.set(term, tm);
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
	// The conversion measurement, audited before it is trusted. Zero
	// purchases while sessions reach the checkout is the signature of a
	// thank-you page the URL classifier cannot see.
	const totalCompleted = [...byCampaign.values()].reduce((n, c) => n + c.completed, 0);
	const totalCheckout = [...byCampaign.values()].reduce((n, c) => n + c.checkout, 0);
	const totalActionSessions = [...byCampaign.values()].reduce((n, c) => n + c.sessions, 0);
	const conversionSuspect: TrafficStatement["conversionSuspect"] =
		isCommerce && totalCompleted === 0 && totalCheckout > 0
			? {
					blocked: true,
					reason:
						"nenhuma compra medida apesar de visitas chegarem ao checkout, " +
						"o que indica que a pagina de confirmacao nao esta sendo reconhecida",
					purchases: totalCompleted,
					checkoutReached: totalCheckout,
				}
			: { blocked: false, reason: null, purchases: totalCompleted, checkoutReached: totalCheckout };

	/** Account conversion rate, used to ask whether a zero is evidence. */
	const accountConvRate = totalActionSessions > 0 ? totalCompleted / totalActionSessions : 0;

		const accountMedian = median(above.map((c) => (100 * c.blind) / c.sessions));

	// The page's reference is the pooled account rate, not the campaign
	// median. A page aggregates many campaigns, so comparing it to the
	// typical campaign would be comparing a pool to a member of a
	// different pool. The campaign median stays the campaign ruler.
	const accountBlindTotal = [...byCampaign.values()].reduce((n, c) => n + c.blind, 0);
	const accountSessionTotal = [...byCampaign.values()].reduce((n, c) => n + c.sessions, 0);
	const accountPooled =
		accountSessionTotal > 0 ? Math.round((1000 * accountBlindTotal) / accountSessionTotal) / 10 : 0;

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
			// Is this campaign still running? Measured from the end of
			// the window, not from today, so a statement regenerated a
			// week later does not quietly change its own verdicts.
			const windowEndMs = new Date(`${options.windowEnd}T23:59:59.999Z`).getTime();
			const daysSinceLastSession = c.lastSeen
				? Math.max(0, Math.floor((windowEndMs - c.lastSeen.getTime()) / 86400000))
				: null;
			// Null means the caller gave no dates, and then the campaign
			// is treated as running. That keeps every existing caller and
			// fixture behaving exactly as before instead of marking the
			// whole account stopped.
			const stopped =
				daysSinceLastSession !== null && daysSinceLastSession >= DAYS_SILENT_BEFORE_STOPPED;

			// Is a cut defensible at all on this campaign?
			const checkoutShare = c.sessions > 0 ? c.checkout / c.sessions : 0;
			// How often a campaign converting at the account rate would
			// show zero purchases purely by sampling. (1-p)^n.
			const falseZeroRisk =
				accountConvRate > 0 && accountConvRate < 1
					? Math.pow(1 - accountConvRate, c.sessions)
					: 0;
			const cutUnsafe =
				conversionSuspect.blocked ||
				(isCommerce && checkoutShare >= CHECKOUT_REACH_BLOCKS_CUT) ||
				falseZeroRisk > MAX_FALSE_ZERO_RISK;

			const margin = marginOfError(blindPct, c.sessions);
			// The verdict acts on the cautious end, never the point
			// estimate. That is what makes a lower session floor honest
			// rather than merely generous: a thin row can still be
			// condemned, but only when even the pessimistic reading
			// condemns it.
			const blindLow = Math.round((blindPct - margin) * 10) / 10;
			const unusual = points - margin >= POINTS_ABOVE_MEDIAN;
			const bad = blindLow >= ABSOLUTE_BLIND_FLOOR;
			const verdict: CampaignRow["verdict"] = stopped
				? // Nothing to recommend about money nobody is spending.
					// This branch is first on purpose: it has to win over
					// every other verdict, including medicao_suspeita,
					// because the honest statement about a campaign that
					// has been off for two weeks is that it is off.
					"parada"
				: blindPct >= IMPLAUSIBLE_BLIND_PCT
					? "medicao_suspeita"
					: unusual && bad
						? // Pausing is only advice when pausing is free, and
							// "free" has to be read in the unit this business
							// earns in. Reading it as purchases told every
							// service business to cut the campaign that
							// brought its leads.
							//
							// Three guards now stand between a zero count and a
							// cut, because the council showed that the zero was
							// the only number in the pipeline with no interval
							// around it:
							//
							//   1. the account's conversion measurement has to
							//      be working at all,
							//   2. a campaign that fills the checkout is a
							//      payment problem, not a traffic problem,
							//   3. the zero has to be unlikely enough to mean
							//      something, given how often a campaign
							//      converting at the account rate would show
							//      zero anyway.
							//
							// Every guard fails toward "corrigir", never toward
							// "cortar". Advice that costs the operator a
							// winning campaign is the one error this product
							// cannot afford.
							(isCommerce ? c.completed : c.contacts) > 0 || cutUnsafe
							? "corrigir"
							: "cortar"
						: points >= 3
							? "observar"
							: "entregando";
			const topLanding =
				[...c.landing.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
			const spendMap = options.spendByCampaignId;
			const spend = !spendMap
				? null
				: (c.platformId ? spendMap.get(c.platformId) : undefined) ??
					spendMap.get(c.name.trim().toLowerCase()) ??
					null;
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
				pauseCostUnit: (isCommerce ? "compras" : "contatos") as "compras" | "contatos",
				pauseCost: isCommerce ? c.completed : c.contacts,
				contactSessions: c.contacts,
				excessBlind: Math.max(0, Math.round((c.sessions * points) / 100)),
				name: c.name,
				// Overwritten below, once every row is known.
				displayName: "",
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
				marginPoints: margin,
				blindPctLow: Math.max(0, blindLow),
				daysSinceLastSession,
				activeDays: c.days.size,
				cutUnsafeReason: (!cutUnsafe
					? null
					: conversionSuspect.blocked
						? "medicao_de_compra_quebrada"
						: isCommerce && checkoutShare >= CHECKOUT_REACH_BLOCKS_CUT
							? "chega_ao_checkout"
							: "zero_nao_e_evidencia") as CampaignRow["cutUnsafeReason"],
				falseZeroRiskPct: Math.round(falseZeroRisk * 1000) / 10,
			};
		})
		// Excess waste, not raw volume and not rate. See decision 1.
		.sort((a, b) => b.excessBlind - a.excessBlind || b.arrivedBlind - a.arrivedBlind);

	// Labels last, because disambiguation needs every row to be known.
	const labelCount = new Map<string, number>();
	for (const c of campaigns) {
		const short = shortCampaignName(c.name);
		labelCount.set(short, (labelCount.get(short) ?? 0) + 1);
	}
	for (const c of campaigns) {
		const short = shortCampaignName(c.name);
		c.displayName =
			(labelCount.get(short) ?? 0) > 1 && c.platformId
				? `${short} [id ${c.platformId.slice(-6)}]`
				: short;
	}

	// Built before the statement object so the account-level verdict can
	// read it. It used to be inline in the return literal, which is why
	// nothing could look at the two dimensions together.
	const landingPageRows = [...byPage.entries()]
		.filter(([, p]) => p.sessions >= floor)
		.map(([path, p]) => {
			const judged = campaigns.filter((c) => c.topLandingPath === path);
			// Still reported, because the table prints it and the
			// account median is the right ruler for a CAMPAIGN. It
			// just does not drive the page verdict, for the reason
			// written at `elsewhere` below.
			const aboveMedian = judged.filter((c) => c.pointsAboveAccount > 0).length;
			const blindPct = Math.round((1000 * p.blind) / p.sessions) / 10;

			// The same discipline the campaign verdict uses: act on
			// the cautious end, never the point estimate. Pages
			// carry far more sessions than campaigns, so the margin
			// is usually small here, which is exactly why it has to
			// be applied rather than assumed away.
			const margin = marginOfError(blindPct, p.sessions);
			const blindLow = Math.round((blindPct - margin) * 10) / 10;
			const wasteShare =
				accountBlindTotal > 0
					? Math.round((1000 * p.blind) / accountBlindTotal) / 10
					: 0;

			// Two gates, and both have to hold. The page is worse
			// than the account it belongs to by a margin that
			// survives the cautious reading, AND it holds enough of
			// the account's waste to be where the money is.
			//
			// Not ABSOLUTE_BLIND_FLOOR. See PAGE_POINTS_ABOVE_POOL
			// for why the campaign floor silently disables this
			// entire verdict.
			const worseThanPool = blindLow - accountPooled >= PAGE_POINTS_ABOVE_POOL;
			const bigEnough = wasteShare >= PAGE_MIN_WASTE_SHARE;
			const bad = worseThanPool && bigEnough;

			// Is the page the common factor, or is it one ad lying?
			//
			// The comparison is against campaigns that land
			// SOMEWHERE ELSE, not against the account median, and
			// that distinction is the whole correctness of this
			// verdict. A page that holds most of the account's
			// campaigns defines the account median itself, so all
			// of its campaigns sit at it, none count as "above",
			// and the verdict flips to "the page converts, the ads
			// are wrong" on precisely the page that is the problem.
			// On a single-page account it would be wrong every
			// time. A test caught it; the live account could not
			// have, because it has six pages.
			//
			// Comparing to elsewhere is also the honest question:
			// the operator wants to know whether this traffic would
			// do better landing somewhere else on their own site.
			const elsewhere = campaigns.filter((c) => c.topLandingPath !== path);
			const elsewhereMedian =
				elsewhere.length > 0
					? median(elsewhere.map((c) => c.arrivedBlindPct))
					: null;
			const degrading =
				elsewhereMedian === null
					? 0
					: judged.filter((c) => c.arrivedBlindPct > elsewhereMedian).length;
			const share = judged.length > 0 ? degrading / judged.length : 0;
			// With nowhere to compare to, blame cannot be
			// apportioned at all, and saying so beats guessing.
			const canApportion =
				elsewhereMedian !== null && judged.length >= MIN_CAMPAIGNS_FOR_PAGE_VERDICT;
			const commonFactor = canApportion && share >= PAGE_COMMON_FACTOR_SHARE;

			const verdict: TrafficStatement["landingPages"][number]["verdict"] =
				blindPct >= IMPLAUSIBLE_BLIND_PCT
					? "medicao_suspeita"
					: bad
						? // Both branches of a distinction the statement
							// already printed in prose and refused to act
							// on. If every campaign landing here degrades,
							// the common factor is the page. If only some
							// do, the others prove the page converts and
							// the page is not the defendant.
							commonFactor
							? "corrigir"
							: canApportion
								? "anuncio_errado"
								: // Over both gates with nothing to compare
									// against. Honest answer is to watch it,
									// not to pick a culprit.
									"observar"
						: // Worse than the account it belongs to, but not by
							// enough to ask for a Monday. Named as watching
							// rather than as fine, because it is the second one
							// of these that becomes next quarter's worst page.
							//
							// Size alone is deliberately NOT a reason to watch.
							// A page can hold every mute visit in the account
							// simply by being the only page, and flagging that
							// would make "observar" mean nothing but "big".
							blindLow > accountPooled
							? "observar"
							: "entregando";

			return {
				path,
				sessions: p.sessions,
				arrivedBlind: p.blind,
				arrivedBlindPct: blindPct,
				campaigns: p.campaigns.size,
				purchases: p.purchases,
				campaignsJudged: judged.length,
				campaignsAboveMedian: aboveMedian,
				campaignsDegrading: degrading,
				elsewhereMedianPct:
					elsewhereMedian === null ? null : Math.round(elsewhereMedian * 10) / 10,
				verdict,
				marginPoints: Math.round(margin * 10) / 10,
				blindPctLow: Math.max(0, blindLow),
				wasteShare,
			};
		})
		// Ranked by wasted arrivals in absolute terms. Stated on the
		// page now: with no sort control, the sort key is not
		// optional information.
		.sort((a, b) => b.arrivedBlind - a.arrivedBlind);

	// ──────────────────────────────────────────────
	// The account itself as the defendant.
	//
	// Both verdicts above are RELATIVE: a campaign is judged against the
	// median campaign, a page against the pooled account. That is what
	// buys the property the second council's statistician approved us
	// for, zero false positives in twenty shuffles, and it has an exact
	// price. In an account that is bad everywhere, every campaign sits
	// at the median it is compared to and the page IS the account, so
	// nothing stands out and nothing is flagged. The product went quiet
	// precisely when the customer was worst, which is the one moment it
	// has to speak.
	//
	// The fix is the one comparison immune to uniformity, and it was
	// already in the product: non-paid traffic on the same site, same
	// pages, same period. Internal spread cannot hide anything from it,
	// because it is not internal.
	//
	// It fires only when the two relative rulers found nothing, which
	// keeps it a fallback rather than a second opinion. An account with
	// a real offender gets that offender named; an account with no
	// offender because everything offends gets told so.
	const anyRelativeFinding =
		campaigns.some(
			(c) =>
				c.verdict === "cortar" || c.verdict === "corrigir" || c.verdict === "medicao_suspeita",
		) || landingPageRows.some((g) => g.verdict === "corrigir" || g.verdict === "anuncio_errado");

	const accountMargin = marginOfError(accountPooled, accountSessionTotal);
	const accountLow = Math.round((accountPooled - accountMargin) * 10) / 10;
	const controlPct =
		controlSessions >= 300 ? Math.round((1000 * controlBlind) / controlSessions) / 10 : null;

	// The absolute component is deliberate. A paid/organic gap alone
	// would fire on nearly every account, because paid traffic is colder
	// by nature and the statement already says so in as many words.
	// What makes this a finding is the account as a whole sitting in the
	// territory that condemns an individual campaign.
	const accountVerdict: TrafficStatement["accountVerdict"] =
		!anyRelativeFinding &&
		accountSessionTotal >= MIN_SESSIONS_FOR_ACCOUNT_VERDICT &&
		accountLow >= ABSOLUTE_BLIND_FLOOR
			? {
					blindPctLow: accountLow,
					marginPoints: Math.round(accountMargin * 10) / 10,
					controlPct,
					gapPoints: controlPct === null ? null : Math.round((accountPooled - controlPct) * 10) / 10,
					campaignsJudged: campaigns.length,
				}
			: null;

	return {
		windowStart: options.windowStart,
		windowEnd: options.windowEnd,
		attributedSessions: attributed,
		measuredSessions: measured,
		attributionCoveragePct: measured > 0 ? Math.round((1000 * attributed) / measured) / 10 : 0,
		accountMedianBlindPct: Math.round(accountMedian * 10) / 10,
		// Same pooled figure the page verdicts compare against, computed
		// once. It used to be recomputed inline here, which is how the
		// two could have drifted apart.
		accountBlindPct: attributed > 0 ? accountPooled : 0,
		accountVerdict,
		notLoaded: {
			sessions: notLoaded,
			withPaidMarker: notLoadedPaid,
			sharePct:
				notLoaded + measured > 0
					? Math.round((1000 * notLoaded) / (notLoaded + measured)) / 10
					: 0,
		},
		conversionSuspect,
		thresholds: {
			absoluteBlindPct: ABSOLUTE_BLIND_FLOOR,
			pointsAboveMedian: POINTS_ABOVE_MEDIAN,
			implausibleBlindPct: IMPLAUSIBLE_BLIND_PCT,
			minSessions: floor,
			minEvents: MIN_EVENTS_INTERACTIVE,
		},
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
		contactsByChannel: [...contactsByChannel.entries()]
			.map(([channel, sessions]) => ({ channel, sessions }))
			.sort((a, b) => b.sessions - a.sessions),
		// A lower floor than a campaign's, because a search term is
		// long-tail by nature: the part number a mechanic types will
		// never see 300 sessions in a month, and holding it to the
		// campaign floor would empty the view it exists to fill. 60 is
		// still enough that a rate is not one visit's worth of noise.
		searchTerms: [...byTerm.entries()]
			.filter(([, t]) => t.sessions >= Math.min(floor, MIN_SESSIONS_PER_TERM))
			.map(([term, t]) => ({
				term,
				sessions: t.sessions,
				arrivedBlind: t.blind,
				arrivedBlindPct: Math.round((1000 * t.blind) / t.sessions) / 10,
				reachedAction: t.action,
				purchases: t.purchases,
				campaigns: t.campaigns.size,
			}))
			.sort((a, b) => b.arrivedBlind - a.arrivedBlind),
		landingPages: landingPageRows,
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
