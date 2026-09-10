// ──────────────────────────────────────────────
// Behavioral measurement — what the pixel MEASURED.
//
// This is the one section of the plan allowed to use the word
// "medido". Everything else in the document is inference over crawl
// evidence or a severity-based estimate; these numbers are counts over
// sessions the customer's own visitors produced.
//
// It exists because of the closing point of the casamontelle
// cross-examination: the TikTok alert (2-second median sessions, 94%
// never reaching 25% scroll) lived in an internal calibration document
// while the paid plan ran entirely on crawl heuristics — "o plano
// trocou o que o pixel mediu por aquilo que o crawler infere". Their
// own checkout telemetry later confirmed the alert's direction with
// independent data (28s vs 120s dwell, 8.5% vs 27.5% conversion),
// which is precisely the kind of insight the plan was failing to
// deliver while it was busy citing /pricing pages that don't exist.
//
// Sources of truth and their limits, stated because the reader of this
// output will be cross-examined again:
//   - Rows come from BehavioralSessionAggregate (sessions reduced once
//     at rest), windowed on the TRAILING 30 days from generation, not
//     the calendar month — "current behavior", labeled as such.
//   - Bot filter is minimal and disclosed: sessions with fewer than 2
//     events are excluded (single-beacon hits carry no behavior). The
//     excluded count ships in the output rather than vanishing.
//   - Scroll milestones are 25/50/75/90 — "no scroll" here means the
//     25% milestone never fired, and the output says so.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { canonicalSourceKey, sourceIdentity } from "../../behavioral/source-identity";
import type { GenerateContext } from "../types";

const WINDOW_DAYS = 30;
const MIN_EVENTS_HUMAN = 2;

/** A source needs this many filtered sessions before we compare it or
 *  alert on it — medians over a handful of visits are noise. */
const MIN_SESSIONS_FOR_SOURCE = 100;

export interface BehavioralSourceStats {
	source: string;
	sessions: number;
	sharePct: number;
	medianDurationS: number;
	pctNoScroll: number;
	/** Sessions where a form inside the site was focused. */
	pctFormStarted: number;
}

export interface BehavioralAlert {
	kind: "no_intent_traffic";
	source: string;
	medianDurationS: number;
	pctNoScroll: number;
	sessions: number;
	/** Pre-written, measurement-honest sentence for direct rendering. */
	text: string;
}

// ── ONDA 2.1 — the MEASURED e-commerce funnel ─────────────────────
// The question every store owner asks first ("onde no caminho até
// pagar eu perco gente?") answered with counted sessions, not
// estimates. Stages derive from fields the aggregator already
// computes on every session (EXAME §2.3 — collected, previously
// consumed by nothing in the plan).

export interface MeasuredFunnelStage {
	key: "arrived" | "product" | "cart" | "checkout" | "payment" | "paid";
	label: string;
	sessions: number;
	/** % of ARRIVED sessions that reached this stage (one decimal —
	 *  0.1% must never display as 0%). */
	pctOfArrived: number;
	/** % drop from the previous stage (one decimal — 99.7% must never
	 *  display as 100%); null on the first stage. */
	dropPctFromPrev: number | null;
}

export interface MeasuredFunnelOutput {
	basis: "pixel_measured";
	/** When the checkout became instrumented inside the window — the
	 *  funnel is computed from here so every stage shares ONE window.
	 *  Null when the whole window is covered. */
	instrumentedSince: string | null;
	/** Sessions the funnel was computed over (post window-alignment). */
	sessionsConsidered: number;
	/** Locale-aware caveat for direct rendering; null when none. */
	note: string | null;
	stages: MeasuredFunnelStage[];
	/** The single worst stage transition — where the most sessions die. */
	biggestDrop: {
		fromLabel: string;
		toLabel: string;
		lostSessions: number;
		dropPct: number;
	} | null;
}

export interface BehavioralMeasurementOutput {
	basis: "pixel_measured";
	windowStart: string;
	windowEnd: string;
	windowDays: number;
	sessionsTotal: number;
	sessionsFiltered: number;
	/** Excluded by the bot filter (fewer than MIN_EVENTS_HUMAN events). */
	sessionsExcluded: number;
	scrollNote: string;
	sources: BehavioralSourceStats[];
	alerts: BehavioralAlert[];
	/** Present only when the window carries enough commerce signal —
	 *  see computeMeasuredFunnel's gate. */
	funnel?: MeasuredFunnelOutput | null;
	/** ONDA 3.2 — counted friction per page from the stored timelines. */
	friction?: import("./measured-friction").MeasuredFrictionOutput | null;
}

interface AggRow {
	aggregate: string;
	eventCount: number;
	startedAt: Date;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

// EXAME A2 — canonical key from the ONE shared identity module. The
// plan persists the key; every customer-facing string renders the
// module's label (never the raw lowercase utm token).
function normalizeSource(raw: string | null | undefined): string {
	return canonicalSourceKey({ source: raw ?? null });
}

export async function generateBehavioralMeasurement(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<BehavioralMeasurementOutput | null> {
	const windowEnd = new Date();
	const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

	const rows: AggRow[] = await prisma.behavioralSessionAggregate.findMany({
		where: {
			envId: ctx.environmentId,
			startedAt: { gte: windowStart, lt: windowEnd },
		},
		select: { aggregate: true, eventCount: true, startedAt: true },
	});

	// No pixel, or pixel just installed: the section simply does not
	// exist. An empty measured section would invite exactly the
	// asserting-absence mistake the rest of this cycle was about.
	if (rows.length === 0) return null;

	type Parsed = {
		source: string;
		durationS: number;
		noScroll: boolean;
		formStarted: boolean;
		funnel: FunnelSession;
	};
	const sessionsTotal = rows.length;
	const parsed: Parsed[] = [];
	let excluded = 0;

	for (const row of rows) {
		if (row.eventCount < MIN_EVENTS_HUMAN) {
			excluded++;
			continue;
		}
		try {
			const agg = JSON.parse(row.aggregate) as {
				attribution?: { first_touch?: { source?: string | null } };
				session_duration_ms?: number;
				max_scroll_depth?: number;
				form_started?: boolean;
				surface_progression?: string[];
				highest_milestone?: string | null;
				checkout_reached?: boolean;
				cart_add_count?: number;
				shipping_step_reached?: boolean;
				payment_step_reached?: boolean;
				confirmation_seen?: boolean;
			};
			parsed.push({
				source: normalizeSource(agg.attribution?.first_touch?.source),
				durationS: Math.round((agg.session_duration_ms ?? 0) / 1000),
				noScroll: (agg.max_scroll_depth ?? 0) === 0,
				formStarted: agg.form_started === true,
				funnel: {
					startedAt: row.startedAt,
					surfaces: agg.surface_progression ?? [],
					highestMilestone: agg.highest_milestone ?? null,
					checkoutReached: agg.checkout_reached === true,
					cartAddCount: agg.cart_add_count ?? 0,
					shippingStepReached: agg.shipping_step_reached === true,
					paymentStepReached: agg.payment_step_reached === true,
					confirmationSeen: agg.confirmation_seen === true,
				},
			});
		} catch {
			excluded++; // unparseable aggregate — treat as excluded, count it
		}
	}

	const bySource = new Map<string, Parsed[]>();
	for (const p of parsed) {
		const list = bySource.get(p.source);
		if (list) list.push(p);
		else bySource.set(p.source, [p]);
	}

	const sources: BehavioralSourceStats[] = [...bySource.entries()]
		.filter(([, list]) => list.length >= MIN_SESSIONS_FOR_SOURCE)
		.map(([source, list]) => ({
			source,
			sessions: list.length,
			sharePct: Math.round((100 * list.length) / parsed.length),
			medianDurationS: median(list.map((p) => p.durationS)),
			pctNoScroll: Math.round((100 * list.filter((p) => p.noScroll).length) / list.length),
			pctFormStarted: Math.round(
				(100 * list.filter((p) => p.formStarted).length) / list.length,
			),
		}))
		.sort((a, b) => b.sessions - a.sessions);

	// Alert: a source whose median session is under 10 seconds and where
	// more than 80% never reach the first scroll milestone is buying
	// arrivals, not visits. Both thresholds sit far from the measured
	// behavior of sources that do engage (facebook: 32s median, 78%
	// no-scroll on the same store), so tripping this requires being
	// dramatically worse than the worst engaged source, not merely bad.
	const alerts: BehavioralAlert[] = sources
		.filter((s) => s.medianDurationS < 10 && s.pctNoScroll > 80)
		.map((s) => ({
			kind: "no_intent_traffic" as const,
			source: s.source,
			medianDurationS: s.medianDurationS,
			pctNoScroll: s.pctNoScroll,
			sessions: s.sessions,
			text:
				`Medido pelo pixel nos últimos ${WINDOW_DAYS} dias: as ${s.sessions.toLocaleString("pt-BR")} sessões vindas de ${sourceIdentity(s.source).label} ` +
				`ficam ${s.medianDurationS}s no site (mediana) e ${s.pctNoScroll}% delas saem sem rolar a primeira tela. ` +
				`Esse tráfego está chegando e indo embora antes de ver a oferta. Se há verba nessa origem, ela está comprando chegadas, não visitas.`,
		}));

	const funnel = computeMeasuredFunnel(
		parsed.map((p) => p.funnel),
		ctx.locale ?? "pt-BR",
	);

	return {
		basis: "pixel_measured",
		windowStart: windowStart.toISOString().slice(0, 10),
		windowEnd: windowEnd.toISOString().slice(0, 10),
		windowDays: WINDOW_DAYS,
		sessionsTotal,
		sessionsFiltered: parsed.length,
		sessionsExcluded: excluded,
		scrollNote:
			"Scroll é medido em marcos de 25/50/75/90% — 'sem rolar' significa que o marco de 25% nunca disparou.",
		sources,
		alerts,
		funnel,
	};
}

// ── ONDA 2.1 — measured funnel computation (pure, tested) ──────────

export interface FunnelSession {
	surfaces: string[];
	highestMilestone: string | null;
	checkoutReached: boolean;
	cartAddCount: number;
	shippingStepReached: boolean;
	paymentStepReached: boolean;
	confirmationSeen: boolean;
	/** Session start — used to align every stage to the same
	 *  instrumentation window (see computeMeasuredFunnel). */
	startedAt: Date;
}

const MILESTONE_ORDER = [
	"awareness_seen",
	"consideration_started",
	"intent_expressed",
	"conversion_started",
	"conversion_completed",
	"post_conversion_seen",
];
function milestoneAtLeast(m: string | null, target: string): boolean {
	if (!m) return false;
	return MILESTONE_ORDER.indexOf(m) >= MILESTONE_ORDER.indexOf(target);
}

const PRODUCT_PATH = /\/(products?|produto|item|p)\//i;
const CART_PATH = /\/(cart|carrinho|carrito|basket)(\/|$|\?)/i;

/** Minimum arrived sessions before a funnel is statistically worth
 *  showing — percentages over a trickle read as precision they don't
 *  have. */
const MIN_SESSIONS_FOR_FUNNEL = 100;

/**
 * The store's REAL funnel from counted sessions:
 * chegou → viu produto → carrinho → checkout → pagamento → pagou.
 *
 * Gate: emitted only when the window has enough sessions AND actual
 * commerce signal (someone reached a cart or checkout) — a SaaS or
 * content site never shows a fake commerce funnel. "Pagou" counts
 * confirmation_seen, which after snippet v2.6 fires only on a strong
 * signal or the merchant's confirm() — never inferred from a heading.
 */
export function computeMeasuredFunnel(
	allSessions: FunnelSession[],
	locale: string,
): MeasuredFunnelOutput | null {
	if (allSessions.length < MIN_SESSIONS_FOR_FUNNEL) return null;
	const pt0 = locale === "pt-BR";

	// ── INSTRUMENTATION-WINDOW ALIGNMENT (validação Casa Montelle) ──
	// The paid stage only exists where the checkout pixel exists. The
	// first generation computed 30 days of "chegou/viu produto" against
	// ~1 day of "pagou" (checkout instrumented the day before) and
	// presented 22.226 → 23 as if it were one funnel — objectively
	// wrong for a store selling daily. Every stage must share ONE
	// window: from the first session that carries checkout-domain
	// surfaces (/c/…) or a payment/confirmation signal. Without any
	// such signal the payment/paid stages are OMITTED — an absent
	// instrument is never displayed as zero purchases.
	const CHECKOUT_SURFACE = /^\/c(\/|$)|^\/checkouts?(\/|$)/i;
	const checkoutCapable = allSessions.filter(
		(s) =>
			s.confirmationSeen ||
			s.paymentStepReached ||
			s.surfaces.some((p) => CHECKOUT_SURFACE.test(p)),
	);
	let sessions = allSessions;
	let instrumentedSince: string | null = null;
	let note: string | null = null;
	const hasPaidInstrument = checkoutCapable.length > 0;
	if (hasPaidInstrument) {
		const first = checkoutCapable.reduce(
			(min, s) => (s.startedAt < min ? s.startedAt : min),
			checkoutCapable[0].startedAt,
		);
		const windowSpan =
			Math.max(...allSessions.map((s) => s.startedAt.getTime())) -
			Math.min(...allSessions.map((s) => s.startedAt.getTime()));
		const coveredSpan =
			Math.max(...allSessions.map((s) => s.startedAt.getTime())) - first.getTime();
		// Only realign when the checkout instrument covers meaningfully
		// less than the window (>20% missing) — otherwise the full
		// window is honest as-is.
		if (windowSpan > 0 && coveredSpan / windowSpan < 0.8) {
			sessions = allSessions.filter((s) => s.startedAt >= first);
			instrumentedSince = first.toISOString().slice(0, 10);
			note = pt0
				? `Funil computado desde ${instrumentedSince}, quando a medição do checkout começou — todos os degraus na mesma janela.`
				: `Funnel computed since ${instrumentedSince}, when checkout measurement began — every stage over the same window.`;
		}
	} else {
		note = pt0
			? "Pagamento e compra ainda não são medidos (pixel não instalado no checkout) — os degraus vão até o checkout."
			: "Payment and purchase are not yet measured (pixel not installed on the checkout) — stages go up to checkout.";
	}
	const arrived = sessions.length;
	if (arrived === 0) return null;

	// FUNNEL SEMANTICS (validação Casa Montelle): each stage counts
	// sessions that reached AT LEAST that far — the session's FURTHEST
	// stage, cumulative from the right. Raw per-predicate counting broke
	// monotonicity on stores whose flow skips a stage entirely (the NX4
	// checkout goes product → /c/ directly, so raw "cart" counted 61
	// while "checkout" counted 181 and the display read "Carrinho 0% ·
	// queda 100%" followed by a RISE — nonsense as a funnel). A session
	// that reached checkout necessarily passed the decision-to-buy
	// stage, whether or not the store renders a cart page.
	const furthest = (s: FunnelSession): number => {
		if (s.confirmationSeen) return 5;
		if (s.paymentStepReached) return 4;
		if (s.checkoutReached || milestoneAtLeast(s.highestMilestone, "conversion_started")) return 3;
		if (s.cartAddCount > 0 || s.surfaces.some((p) => CART_PATH.test(p))) return 2;
		if (
			s.surfaces.some((p) => PRODUCT_PATH.test(p)) ||
			milestoneAtLeast(s.highestMilestone, "consideration_started")
		) return 1;
		return 0;
	};
	const stagesReached = sessions.map(furthest);
	const atLeast = (n: number) => stagesReached.filter((f) => f >= n).length;
	const product = atLeast(1);
	const cart = atLeast(2);
	const checkout = atLeast(3);
	const payment = atLeast(4);
	const paid = atLeast(5);

	// No commerce signal in the window → no funnel (never fabricate).
	if (cart === 0 && checkout === 0) return null;

	const pt = locale === "pt-BR";
	// One-decimal percentages: 23/22226 must read 0,1%, never 0%; and a
	// 99,7% drop must never round to "100%" (which reads as "nobody").
	const pct1 = (num: number, den: number): number =>
		den > 0 ? Math.round((1000 * num) / den) / 10 : 0;
	const defs: Array<{ key: MeasuredFunnelStage["key"]; label: string; sessions: number }> = [
		{ key: "arrived", label: pt ? "Chegou no site" : "Arrived", sessions: arrived },
		{ key: "product", label: pt ? "Viu produto" : "Viewed a product", sessions: product },
		{ key: "cart", label: pt ? "Carrinho" : "Cart", sessions: cart },
		{ key: "checkout", label: pt ? "Checkout" : "Checkout", sessions: checkout },
	];
	if (hasPaidInstrument) {
		defs.push(
			{ key: "payment", label: pt ? "Pagamento" : "Payment", sessions: payment },
			{ key: "paid", label: pt ? "Pagou" : "Paid", sessions: paid },
		);
	}

	const stages: MeasuredFunnelStage[] = defs.map((d, i) => {
		const prev = i > 0 ? defs[i - 1].sessions : null;
		return {
			key: d.key,
			label: d.label,
			sessions: d.sessions,
			pctOfArrived: pct1(d.sessions, arrived),
			dropPctFromPrev:
				prev !== null && prev > 0 ? Math.max(0, pct1(prev - d.sessions, prev)) : null,
		};
	});

	// Worst transition by ABSOLUTE lost sessions (that is where the
	// money is), reported with its % for context. Skip transitions out
	// of a zero stage.
	let biggest: MeasuredFunnelOutput["biggestDrop"] = null;
	for (let i = 1; i < defs.length; i++) {
		const prev = defs[i - 1];
		if (prev.sessions === 0) continue;
		const lost = prev.sessions - defs[i].sessions;
		if (lost <= 0) continue;
		if (!biggest || lost > biggest.lostSessions) {
			biggest = {
				fromLabel: prev.label,
				toLabel: defs[i].label,
				lostSessions: lost,
				dropPct: Math.round((1000 * lost) / prev.sessions) / 10,
			};
		}
	}

	return {
		basis: "pixel_measured",
		instrumentedSince,
		sessionsConsidered: arrived,
		note,
		stages,
		biggestDrop: biggest,
	};
}
