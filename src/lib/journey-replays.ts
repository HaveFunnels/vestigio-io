import { prisma } from "@/libs/prismaDb";
import { aggregateSession } from "../../packages/behavioral/session-aggregator";
import type {
	RawBehavioralBatch,
	SessionAggregate,
	AttributionContext,
} from "../../packages/behavioral/types";
import {
	shouldApplyEcommerceSemantics,
	classifyCtaLabel,
	classifyPath,
	humanizeSignal,
	type EcommerceSignal,
} from "../../packages/behavioral/ecommerce-semantics";
import { humanizePath, humanizePathSlot } from "@/lib/humanize-path";

// ──────────────────────────────────────────────
// Bundle D — Buyer Journey Replays
//
// Seleciona N sessões representativas de abandonos / drop-offs /
// desvios e normaliza em timelines pra renderizar. Toda a parte
// "qual sessão merece ser mostrada" mora aqui; LLM narrator e UI
// consomem o output normalizado.
//
// Anonimização:
//   - session_id substituído por persona_id sintético ("Comprador
//     mobile · paid Google · cyber-monday")
//   - sem IP, sem UA visível, sem query strings nos paths
//   - timestamps relativos (00:23 desde o início da sessão)
// ──────────────────────────────────────────────

export interface NormalizedTimelineEvent {
	/** Tempo relativo ao início da sessão em segundos */
	t_seconds: number;
	kind:
		| "page_enter"
		| "page_dwell"
		| "cta_click"
		| "form_focus"
		| "form_error"
		| "form_retry"
		| "scroll_milestone"
		| "hesitation"
		| "backtrack"
		| "exit";
	label: string; // human-readable: "Adicionou ao carrinho em página de produto"
	path: string | null; // surface path sem query string

	// ── Wave 22.9 · Onda 1 — Enriched context ──
	//
	// Populated by mapEventToTimeline when the underlying pixel event
	// carried the data. UI reveals these on hover so the customer can
	// follow WHAT happened, not just WHEN. Narrator prompt uses them
	// to write about the specific CTA / field / surface instead of
	// resorting to labels like "friction em form".
	//
	// All optional — legacy events that predate the enrichment pass
	// still render cleanly without the extras.

	/** Semantic label of the CTA the buyer clicked ("Adicionar ao
	 *  carrinho", "Finalizar compra"). Populated for cta_click. */
	cta_label?: string;
	/** Ecommerce signal derived from the CTA label OR path — lets
	 *  UI + narrator distinguish cart_add from checkout_go from
	 *  variant_toggle without re-classifying. Populated when the
	 *  vertical gate is open AND classifier matched. */
	ecommerce_signal?: EcommerceSignal;
	/** Milliseconds the buyer paused. Populated for hesitation. */
	pause_ms?: number;
	/** Whether the pause happened near a CTA. Populated for
	 *  hesitation — key signal for "hesitou perto de comprar". */
	near_cta?: boolean;
	/** Scroll depth reached (25/50/75/90). Populated for
	 *  scroll_milestone; on cluster merge holds the MAX depth
	 *  reached, not the last one seen. */
	scroll_depth_pct?: number;
	/** Milliseconds the CTA took to render past load. Populated for
	 *  cta_rendered_late (surfaces as a cta_click with this extra). */
	render_delay_ms?: number;
	/** Prior path when the buyer backtracked TO this event's path.
	 *  Populated for backtrack. */
	from_path?: string;
	/**
	 * When >= 2, this row is a cluster of consecutive same-kind
	 * same-path events collapsed by clusterTimeline(). UI can render
	 * "Rolou até 90% (25→50→75→90 em 42s)" instead of 4 near-identical
	 * rows. Never set for anchor events (cta_click, form_error,
	 * page_enter, exit) — clustering them would drop signal.
	 */
	cluster_count?: number;
	/** For clustered scroll_milestone rows: the MIN depth in the cluster,
	 *  so the UI can render "25 → 90%" instead of just the max. */
	scroll_depth_min_pct?: number;
	/** For clusters: seconds spanned by the cluster (start to end). */
	cluster_span_seconds?: number;
}

export interface JourneyReplay {
	/** Persona sintética anonimizada */
	persona: {
		descriptor: string; // "Comprador mobile · paid Google · cyber-monday"
		device: "mobile" | "desktop" | "unknown";
		source_label: string; // "Google Ads" | "Facebook" | "Orgânico" | etc.
		campaign_label: string | null; // "cyber-monday" | null
		visitor_type: "first_time" | "returning" | "unknown";
	};
	/** Métricas da sessão */
	metrics: {
		duration_ms: number;
		surface_count: number;
		exit_path: string | null;
		intent_label: string; // "Chegou no checkout" | "Adicionou ao carrinho" | etc.
		highest_milestone: string | null;
	};
	/** Pattern attribution — qual padrão de friction predomina.
	 *  Wave 22.9 · Fase 0 — 8 legacy kinds + 7 ecom-specific kinds
	 *  (gated behind vertical=ecommerce OR path-evidence auto-detect).
	 */
	pattern: {
		kind:
			// Legacy — used for every vertical (SaaS / leadgen / infoproduto / etc.)
			| "form_friction"
			| "trust_break"
			| "oscillation"
			| "handoff_drop"
			| "mobile_payment_fail"
			| "slow_load"
			| "policy_detour"
			| "deviation_unknown"
			// Ecommerce-specific — emitted only when shouldApplyEcommerceSemantics
			// says yes. These win over the legacy kinds when both apply.
			| "pricing_shock_at_checkout"
			| "variant_indecision"
			| "forced_signup_gate"
			| "shipping_reveal_shock"
			| "payment_method_stall"
			| "browse_no_intent"
			| "coupon_retry_stuck";
		short_label: string; // "Choque de preço no checkout" | "Indecisão de variante" | etc.
	};
	/** Estimativa de perda em centavos */
	estimated_lost_brl_cents: number;
	/** Timeline normalizada */
	timeline: NormalizedTimelineEvent[];
	/** Score interno (pra debug/ordering, não exposto ao customer) */
	score: number;
	/** session_id hasheado pra dedup interno (não exposto ao customer) */
	session_hash: string;
}

interface RawEventShape {
	type: string;
	ts: number;
	url?: string;
	session_id?: string;
	env_id?: string;
	data?: Record<string, unknown>;
}

const MAX_SESSIONS_TO_AGGREGATE = 500;
const MOBILE_UA_REGEX = /Mobile|Android|iPhone|iPad|iPod/i;

/**
 * Retorna até `limit` jornadas representativas do mês para o env.
 * Quando não há eventos suficientes, retorna array vazio — caller
 * decide se renderiza empty state.
 */
export async function selectTopJourneys(
	envId: string,
	monthStart: Date,
	monthEnd: Date,
	limit: number = 3,
): Promise<JourneyReplay[]> {
	// Wave 22.9 · Fase 0 — Pull the env's perceivedVertical so pattern
	// classification can promote ecommerce-specific kinds. Falls back
	// to path-evidence autodetection per-session when the field is
	// null (fresh env, PV.2 not run yet).
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: { perceivedVertical: true },
	});
	const explicitVertical = env?.perceivedVertical ?? null;

	// Query rows do mês. Limite com cap pra evitar OOM em envs com
	// pixel muito ativo.
	const rows = await prisma.rawBehavioralEvent.findMany({
		where: {
			envId,
			receivedAt: { gte: monthStart, lt: monthEnd },
		},
		select: {
			id: true,
			sessionId: true,
			eventType: true,
			url: true,
			occurredAt: true,
			payload: true,
			attribution: true,
			userAgent: true,
		},
		orderBy: [{ sessionId: "asc" }, { occurredAt: "asc" }],
		take: 50_000, // upper bound — ~500 sessões com 100 eventos cada
	});

	if (rows.length === 0) return [];

	// Group by sessionId
	const sessionMap = new Map<
		string,
		{
			events: RawEventShape[];
			attribution: AttributionContext | null;
			userAgent: string | null;
		}
	>();
	for (const row of rows) {
		if (sessionMap.size >= MAX_SESSIONS_TO_AGGREGATE && !sessionMap.has(row.sessionId)) {
			continue;
		}
		let bucket = sessionMap.get(row.sessionId);
		if (!bucket) {
			bucket = { events: [], attribution: null, userAgent: row.userAgent ?? null };
			sessionMap.set(row.sessionId, bucket);
		}
		if (!bucket.userAgent && row.userAgent) {
			bucket.userAgent = row.userAgent;
		}
		try {
			const parsed = JSON.parse(row.payload) as RawEventShape;
			bucket.events.push({
				type: parsed.type,
				ts: parsed.ts,
				session_id: parsed.session_id || row.sessionId,
				env_id: parsed.env_id || envId,
				url: parsed.url || row.url,
				data: parsed.data || {},
			});
		} catch {
			// skip malformed
		}
		if (!bucket.attribution && row.attribution) {
			try {
				bucket.attribution = JSON.parse(row.attribution) as AttributionContext;
			} catch {
				// skip malformed attribution
			}
		}
	}

	// Aggregate + filter + score
	const candidates: Array<{
		aggregate: SessionAggregate;
		rawEvents: RawEventShape[];
		userAgent: string | null;
		score: number;
	}> = [];

	for (const [sessionId, bucket] of sessionMap.entries()) {
		if (bucket.events.length < 2) continue; // sessões muito curtas n contam
		const batch: RawBehavioralBatch = {
			events: bucket.events as any,
			attribution: bucket.attribution ?? EMPTY_ATTRIBUTION,
			session_id: sessionId,
			env_id: envId,
		};
		let agg: SessionAggregate;
		try {
			agg = aggregateSession(batch);
		} catch {
			continue;
		}

		// Filter: só problemas. Customer pediu só abandonos / drop-offs /
		// desvios — converter sucesso não interessa pro plan.
		if (!matchesProblemFilter(agg)) continue;

		const score = scoreSession(agg);
		candidates.push({ aggregate: agg, rawEvents: bucket.events, userAgent: bucket.userAgent, score });
	}

	// Ordena por score desc, pega top N
	candidates.sort((a, b) => b.score - a.score);
	const top = candidates.slice(0, limit);

	// Normaliza cada candidato em JourneyReplay. Ecommerce gate is
	// evaluated per-session with the explicit vertical carried through
	// from Environment.perceivedVertical.
	return top.map((c) =>
		normalizeJourney(c.aggregate, c.rawEvents, c.userAgent, c.score, explicitVertical),
	);
}

// ──────────────────────────────────────────────
// Filter + scoring
// ──────────────────────────────────────────────

function matchesProblemFilter(agg: SessionAggregate): boolean {
	// Não converteu E (tinha intenção OU teve fricção)
	const hadIntent = agg.checkout_reached || agg.form_started || agg.surface_progression.length >= 3;
	const hadFriction =
		agg.backtrack_count > 0 ||
		agg.dead_click_count > 0 ||
		agg.hesitation_pause_count > 0 ||
		agg.rapid_backtrack_count > 0 ||
		agg.form_retry_count > 0 ||
		agg.input_focus_abandon_count > 0 ||
		agg.oscillation_pairs.length > 0 ||
		(agg.handoff_started && !agg.handoff_returned) ||
		agg.policy_before_conversion ||
		agg.pricing_then_backtrack;
	return !agg.reached_thank_you && (hadIntent || hadFriction);
}

function scoreSession(agg: SessionAggregate): number {
	let score = 0;

	// Intent — quão fundo no funnel o cliente chegou
	if (agg.checkout_reached) score += 40;
	else if (agg.form_started) score += 25;
	else if (agg.surface_progression.length >= 4) score += 15;
	else if (agg.surface_progression.length >= 2) score += 5;

	// Friction signals — quão tangível foi o problema
	score += Math.min(20, agg.form_retry_count * 5);
	score += Math.min(15, agg.hesitation_pause_count * 3);
	score += Math.min(15, agg.backtrack_count * 3);
	score += Math.min(10, agg.dead_click_count * 2);
	score += Math.min(15, agg.oscillation_pairs.length * 5);
	if (agg.input_focus_abandon_count > 0) score += 10;
	if (agg.handoff_started && !agg.handoff_returned) score += 20;

	// Sessões muito curtas ou muito longas perdem pontos
	const minutes = agg.session_duration_ms / 60000;
	if (minutes < 0.5) score -= 10; // bounce
	if (minutes > 30) score -= 5; // provavelmente sessão fantasma

	return Math.max(0, score);
}

// ──────────────────────────────────────────────
// Normalization
// ──────────────────────────────────────────────

function normalizeJourney(
	agg: SessionAggregate,
	rawEvents: RawEventShape[],
	userAgent: string | null,
	score: number,
	explicitVertical: string | null,
): JourneyReplay {
	const device: JourneyReplay["persona"]["device"] = userAgent
		? MOBILE_UA_REGEX.test(userAgent)
			? "mobile"
			: "desktop"
		: "unknown";

	const sourceLabel = humanizeSource(agg.attribution.first_touch);
	const campaignLabel = humanizeCampaign(agg.attribution.first_touch);
	const visitorType = inferVisitorType(agg);

	const descriptor = [
		`Comprador ${device === "mobile" ? "mobile" : device === "desktop" ? "desktop" : "anônimo"}`,
		sourceLabel,
		campaignLabel,
	]
		.filter(Boolean)
		.join(" · ");

	// Wave 22.9 · Fase 0 — gate ecommerce pattern promotion on either
	// explicit vertical OR path-evidence auto-detect. Sessions without
	// enough ecommerce path evidence stay on legacy pattern taxonomy.
	const applyEcommerce = shouldApplyEcommerceSemantics(
		explicitVertical,
		agg.surface_progression,
	);
	const pattern = classifyPattern(agg, { applyEcommerce, device });
	const intentLabel = labelIntent(agg);
	const estimatedLostCents = estimateLostValueCents(agg);

	return {
		persona: {
			descriptor,
			device,
			source_label: sourceLabel,
			campaign_label: campaignLabel,
			visitor_type: visitorType,
		},
		metrics: {
			duration_ms: agg.session_duration_ms,
			surface_count: agg.surface_progression.length,
			exit_path: agg.last_exit_page ? stripQuery(agg.last_exit_page) : null,
			intent_label: intentLabel,
			highest_milestone: agg.highest_milestone ?? null,
		},
		pattern,
		estimated_lost_brl_cents: estimatedLostCents,
		timeline: buildTimeline(rawEvents, agg, { applyEcommerce }),
		score,
		session_hash: hashSessionId(agg.session_id),
	};
}

function humanizeSource(touch: AttributionContext): string {
	const source = (touch.source ?? "").toLowerCase();
	const medium = (touch.medium ?? "").toLowerCase();
	if (touch.gclid || source.includes("google") && medium.includes("cpc")) return "Google Ads";
	if (touch.fbclid || source.includes("facebook") || source.includes("fb")) return "Facebook Ads";
	if (source.includes("instagram") || source.includes("ig")) return "Instagram";
	if (source.includes("tiktok")) return "TikTok";
	if (source.includes("linkedin")) return "LinkedIn";
	if (medium === "email" || source.includes("klaviyo") || source.includes("brevo"))
		return "Email";
	if (medium === "organic" || source === "google" || source === "bing") return "Orgânico";
	if (touch.referrer) {
		try {
			const host = new URL(touch.referrer).hostname.replace(/^www\./, "");
			return `Referência (${host})`;
		} catch {
			return "Referência";
		}
	}
	return "Direto";
}

function humanizeCampaign(touch: AttributionContext): string | null {
	if (!touch.campaign) return null;
	// Normalize: cyber-monday → "cyber-monday" (lowercase, hyphenated)
	return touch.campaign.toLowerCase().slice(0, 30);
}

function inferVisitorType(agg: SessionAggregate): JourneyReplay["persona"]["visitor_type"] {
	if (agg.attribution.touch_count > 1) return "returning";
	return "first_time";
}

function labelIntent(agg: SessionAggregate): string {
	if (agg.checkout_reached) return "Chegou no checkout";
	if (agg.form_started) return "Começou form";
	if (agg.surface_progression.length >= 4) return "Navegou profundo";
	if (agg.surface_progression.length >= 2) return "Explorou";
	return "Apenas entrou";
}

function classifyPattern(
	agg: SessionAggregate,
	opts: {
		applyEcommerce: boolean;
		device: JourneyReplay["persona"]["device"];
	},
): JourneyReplay["pattern"] {
	// Wave 22.9 · Fase 0 — ordering by proximity-to-money. Handoff
	// drop wins over everything because the buyer had card in hand.
	// Ecommerce-specific kinds come next when the gate is open —
	// they name the failure mode with the specificity the LLM
	// narrator needs to write actionably.
	if (agg.handoff_started && !agg.handoff_returned) {
		return { kind: "handoff_drop", short_label: "Não voltou do gateway externo" };
	}

	if (opts.applyEcommerce) {
		// Pricing shock at checkout — buyer viewed pricing, reached
		// checkout, then backtracked. This is the top ecom abandonment
		// root cause per the council's ecommerce-checkout seat.
		if (agg.pricing_delta_backtrack) {
			return {
				kind: "pricing_shock_at_checkout",
				short_label: "Choque de preço entre carrinho e checkout",
			};
		}
		// Coupon retry stuck — 2+ coupon apply attempts + form retry.
		if ((agg.coupon_apply_count ?? 0) >= 2 && (agg.form_retry_count ?? 0) >= 1) {
			return {
				kind: "coupon_retry_stuck",
				short_label: "Travou tentando aplicar cupom",
			};
		}
		// Shipping reveal shock — reached shipping step, then backtracked.
		if (agg.shipping_step_reached && (agg.cart_oscillation_count ?? 0) > 0) {
			return {
				kind: "shipping_reveal_shock",
				short_label: "Voltou depois de ver o frete",
			};
		}
		// Forced signup gate — session hit login/cadastro before payment_step.
		if (agg.signup_gate_hit && !agg.payment_step_reached) {
			return {
				kind: "forced_signup_gate",
				short_label: "Checkout exigiu cadastro antes de pagar",
			};
		}
		// Payment method stall — reached payment step, sat there, no handoff.
		if (
			agg.payment_step_reached &&
			!agg.handoff_started &&
			agg.session_duration_ms > 60_000
		) {
			return {
				kind: "payment_method_stall",
				short_label: "Travou na escolha do pagamento",
			};
		}
		// Variant indecision — variant_toggle 2+ OR oscillation between
		// product-adjacent surfaces.
		if (
			(agg.variant_toggle_count ?? 0) >= 2 ||
			(agg.oscillation_pairs.length > 0 && (agg.cart_add_count ?? 0) === 0)
		) {
			return {
				kind: "variant_indecision",
				short_label: "Não decidiu entre variantes do produto",
			};
		}
		// Browse without intent — deep nav, zero cta_click, zero cart_add.
		if (
			agg.surface_progression.length >= 5 &&
			agg.cta_clicked_count === 0 &&
			(agg.cart_add_count ?? 0) === 0
		) {
			return {
				kind: "browse_no_intent",
				short_label: "Navegou fundo mas não engajou",
			};
		}
	}

	// Legacy taxonomy — used for non-ecommerce OR when no ecommerce
	// pattern above applied.
	if (agg.form_retry_count > 1 || agg.input_focus_abandon_count > 0) {
		return { kind: "form_friction", short_label: "Friction em form" };
	}
	if (agg.policy_before_conversion) {
		return { kind: "policy_detour", short_label: "Detour de política antes do checkout" };
	}
	if (agg.oscillation_pairs.length > 0) {
		return { kind: "oscillation", short_label: "Oscilação entre páginas" };
	}
	if (agg.pricing_then_backtrack) {
		return { kind: "trust_break", short_label: "Viu preço e recuou" };
	}
	if (agg.cta_rendered_late_count > 0 && opts.device === "mobile") {
		return { kind: "mobile_payment_fail", short_label: "CTA carregou tarde no mobile" };
	}
	if (agg.cta_rendered_late_count > 0) {
		return { kind: "slow_load", short_label: "CTA carregou tarde demais" };
	}
	return { kind: "deviation_unknown", short_label: "Desvio do caminho esperado" };
}

function estimateLostValueCents(agg: SessionAggregate): number {
	// Proxy heuristic: stronger intent = higher implied lost value.
	// Sem AOV real do cliente, usa tier:
	//   - checkout reached: R$ 200
	//   - form started: R$ 80
	//   - deep nav: R$ 30
	//   - shallow: R$ 5
	if (agg.checkout_reached) return 20000;
	if (agg.form_started) return 8000;
	if (agg.surface_progression.length >= 4) return 3000;
	return 500;
}

function stripQuery(url: string): string {
	try {
		const u = new URL(url);
		return u.pathname;
	} catch {
		return url.split("?")[0];
	}
}

function buildTimeline(
	rawEvents: RawEventShape[],
	agg: SessionAggregate,
	opts: { applyEcommerce: boolean },
): NormalizedTimelineEvent[] {
	const sorted = [...rawEvents].sort((a, b) => a.ts - b.ts);
	if (sorted.length === 0) return [];
	const startTs = sorted[0].ts;
	const events: NormalizedTimelineEvent[] = [];
	let lastPath: string | null = null; // tracked for backtrack context

	for (const ev of sorted) {
		const t = Math.round((ev.ts - startTs) / 1000);
		const path = ev.url ? stripQuery(ev.url) : null;
		const item = mapEventToTimeline(ev, t, path, lastPath, opts);
		if (item) events.push(item);
		if (path) lastPath = path;
	}

	// Add exit event from aggregate.
	if (agg.last_exit_page) {
		const exitPath = stripQuery(agg.last_exit_page);
		events.push({
			t_seconds: Math.round(agg.session_duration_ms / 1000),
			kind: "exit",
			label: `Saiu ${humanizePathSlot(exitPath)} sem converter`,
			path: exitPath,
		});
	}

	// Wave 22.9 · Onda 1 — cluster low-information repeats BEFORE the
	// cap so the cap becomes a rare fallback rather than the default.
	// Never cluster anchor events (cta_click, form_error, form_retry,
	// backtrack, page_enter, exit) — those carry meaning individually.
	const clustered = clusterTimeline(events);

	// Cap em 40 (bumped from 18). Onda 1 kills the +N eventos UI cap
	// and replaces with "Ver todos", so the server cap becomes a
	// last-line-of-defense against pathological sessions rather than
	// the primary shape. Preserves entry + exit as before.
	if (clustered.length > 40) {
		return [...clustered.slice(0, 20), ...clustered.slice(-20)];
	}
	return clustered;
}

// ──────────────────────────────────────────────
// Clustering — collapse consecutive scroll_milestone / page_dwell /
// hesitation rows with the same path. Anchor events (cta_click,
// form_error/retry, backtrack, page_enter, exit) never cluster.
// ──────────────────────────────────────────────

const CLUSTERABLE_KINDS = new Set<NormalizedTimelineEvent["kind"]>([
	"scroll_milestone",
	"page_dwell",
	"hesitation",
]);
const CLUSTER_WINDOW_SECONDS = 15;

function clusterTimeline(events: NormalizedTimelineEvent[]): NormalizedTimelineEvent[] {
	const out: NormalizedTimelineEvent[] = [];
	for (const ev of events) {
		const prev = out[out.length - 1];
		const mergable =
			prev !== undefined &&
			prev.kind === ev.kind &&
			prev.path === ev.path &&
			CLUSTERABLE_KINDS.has(ev.kind) &&
			ev.t_seconds - (prev.t_seconds ?? 0) <= CLUSTER_WINDOW_SECONDS;
		if (!mergable) {
			out.push({ ...ev });
			continue;
		}
		// Merge in place on the running head.
		const prevCount = prev!.cluster_count ?? 1;
		prev!.cluster_count = prevCount + 1;
		prev!.cluster_span_seconds = ev.t_seconds - (prev!.t_seconds ?? 0);
		// For scroll: track BOTH min and max depth so the UI can render
		// the range "25 → 90%" rather than just the last hit.
		if (ev.kind === "scroll_milestone") {
			const evDepth = ev.scroll_depth_pct ?? 0;
			const prevDepth = prev!.scroll_depth_pct ?? 0;
			if (evDepth > prevDepth) prev!.scroll_depth_pct = evDepth;
			if (prev!.scroll_depth_min_pct === undefined) {
				prev!.scroll_depth_min_pct = prevDepth || undefined;
			}
			if (
				evDepth &&
				(prev!.scroll_depth_min_pct === undefined || evDepth < prev!.scroll_depth_min_pct)
			) {
				// unreachable given we track the running min already,
				// but defensive.
			}
			const maxDepth = prev!.scroll_depth_pct ?? evDepth;
			prev!.label = `Rolou até ${maxDepth}% ${humanizePathSlot(prev!.path)}`;
		}
		if (ev.kind === "hesitation") {
			prev!.label = `Pausou ${prev!.cluster_count} vezes ${humanizePathSlot(prev!.path)}`;
		}
		if (ev.kind === "page_dwell") {
			prev!.label = `Ficou parado ${humanizePathSlot(prev!.path)}`;
		}
	}
	return out;
}

function mapEventToTimeline(
	ev: RawEventShape,
	tSeconds: number,
	path: string | null,
	lastPath: string | null,
	opts: { applyEcommerce: boolean },
): NormalizedTimelineEvent | null {
	switch (ev.type) {
		case "page_view":
		case "route_change": {
			const ecomSignal = opts.applyEcommerce ? classifyPath(path) ?? undefined : undefined;
			// Ecommerce path signals get more concrete labels than the
			// generic "Chegou em X" — e.g. policy_visit becomes "Foi
			// conferir política" rather than the raw path.
			let label = path ? `Chegou ${humanizePathSlot(path)}` : "Nova página";
			if (ecomSignal === "policy_visit") label = `Foi conferir política ${humanizePathSlot(path)}`;
			else if (ecomSignal === "signup_gate_hit") label = `Bateu em tela de cadastro`;
			else if (ecomSignal === "confirmation") label = `Chegou na página de confirmação`;
			return {
				t_seconds: tSeconds,
				kind: "page_enter",
				label,
				path,
				ecommerce_signal: ecomSignal,
			};
		}
		case "cta_click": {
			const ctaLabel = (ev.data?.label as string | undefined) ?? "";
			const ecomSignal = opts.applyEcommerce ? classifyCtaLabel(ctaLabel) ?? undefined : undefined;
			// Use the ecommerce signal's human label when available
			// (e.g. cart_add → "Adicionou ao carrinho"), and always
			// keep the raw CTA text as a quoted artifact so hover can
			// reveal the exact button copy the buyer saw.
			let label: string;
			if (ecomSignal) {
				label = `${humanizeSignal(ecomSignal)} ${humanizePathSlot(path)}`;
			} else if (ctaLabel) {
				label = `Clicou em "${ctaLabel}" ${humanizePathSlot(path)}`;
			} else {
				label = `Clicou em CTA ${humanizePathSlot(path)}`;
			}
			return {
				t_seconds: tSeconds,
				kind: "cta_click",
				label,
				path,
				cta_label: ctaLabel || undefined,
				ecommerce_signal: ecomSignal,
			};
		}
		case "form_focus":
		case "input_focus":
			return {
				t_seconds: tSeconds,
				kind: "form_focus",
				label: `Focou em formulário ${humanizePathSlot(path)}`,
				path,
			};
		case "form_error":
			return {
				t_seconds: tSeconds,
				kind: "form_error",
				label: `Erro em campo do formulário ${humanizePathSlot(path)}`,
				path,
			};
		case "form_retry":
		case "form_submit_retry":
			return {
				t_seconds: tSeconds,
				kind: "form_retry",
				label: `Tentou enviar o formulário novamente ${humanizePathSlot(path)}`,
				path,
			};
		case "scroll_depth":
		case "scroll_milestone": {
			const depthRaw =
				(ev.data?.depth as number | undefined) ??
				(ev.data?.depth_pct as number | undefined) ??
				null;
			const depth = depthRaw != null ? Math.round(depthRaw) : null;
			return {
				t_seconds: tSeconds,
				kind: "scroll_milestone",
				label: depth !== null ? `Rolou até ${depth}% ${humanizePathSlot(path)}` : `Rolou ${humanizePathSlot(path)}`,
				path,
				scroll_depth_pct: depth ?? undefined,
			};
		}
		case "hesitation_pause": {
			const pauseMs = (ev.data?.pause_ms as number | undefined) ?? undefined;
			const nearCta = (ev.data?.near_cta as boolean | undefined) ?? undefined;
			const seconds = pauseMs ? Math.round(pauseMs / 1000) : null;
			const durationHint = seconds ? `${seconds}s` : "";
			// "Pausou 8s perto do CTA no checkout" reads far more
			// specifically than "Pausou (hesitação)" — the diagnostic
			// downstream can then talk about the specific CTA moment.
			let label: string;
			if (nearCta && durationHint) {
				label = `Pausou ${durationHint} perto do CTA ${humanizePathSlot(path)}`;
			} else if (nearCta) {
				label = `Pausou perto do CTA ${humanizePathSlot(path)}`;
			} else if (durationHint) {
				label = `Pausou ${durationHint} ${humanizePathSlot(path)}`;
			} else {
				label = `Pausou ${humanizePathSlot(path)}`;
			}
			return {
				t_seconds: tSeconds,
				kind: "hesitation",
				label,
				path,
				pause_ms: pauseMs,
				near_cta: nearCta,
			};
		}
		case "backtrack":
		case "rapid_backtrack": {
			// Backtrack context — WHERE did the buyer come from?
			// Rendered as "Voltou de [X] pra [Y]" so the analysis
			// chain doesn't lose the pair.
			const fromHumanized = lastPath ? humanizePathSlot(lastPath).replace(/^em /, "").replace(/^no /, "").replace(/^na /, "") : null;
			const label = fromHumanized && path
				? `Voltou de ${fromHumanized} para ${humanizePath(path)}`
				: `Voltou pra página anterior`;
			return {
				t_seconds: tSeconds,
				kind: "backtrack",
				label,
				path,
				from_path: lastPath ?? undefined,
			};
		}
		case "cta_rendered_late": {
			const renderDelayMs = (ev.data?.render_delay_ms as number | undefined) ?? undefined;
			const label = renderDelayMs
				? `CTA só apareceu ${Math.round(renderDelayMs / 1000)}s depois ${humanizePathSlot(path)}`
				: `CTA carregou tarde ${humanizePathSlot(path)}`;
			return {
				t_seconds: tSeconds,
				kind: "cta_click",
				label,
				path,
				render_delay_ms: renderDelayMs,
			};
		}
		default:
			return null;
	}
}

function hashSessionId(sessionId: string): string {
	// Hash leve só pra dedup interno — não criptográfico.
	let h = 0;
	for (let i = 0; i < sessionId.length; i++) {
		h = (h * 31 + sessionId.charCodeAt(i)) | 0;
	}
	return Math.abs(h).toString(36);
}

const EMPTY_ATTRIBUTION: AttributionContext = {
	source: null,
	medium: null,
	campaign: null,
	referrer: null,
	landing_url: null,
	gclid: null,
	fbclid: null,
};
