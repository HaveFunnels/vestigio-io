import { prisma } from "@/libs/prismaDb";
import { aggregateSession } from "../../packages/behavioral/session-aggregator";
import type {
	RawBehavioralBatch,
	SessionAggregate,
	AttributionContext,
} from "../../packages/behavioral/types";

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
	label: string; // human-readable: "Entrou em /checkout (2.8s pra carregar)"
	path: string | null; // surface path sem query string
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
	/** Pattern attribution — qual padrão de friction predomina */
	pattern: {
		kind:
			| "form_friction"
			| "trust_break"
			| "oscillation"
			| "handoff_drop"
			| "mobile_payment_fail"
			| "slow_load"
			| "policy_detour"
			| "deviation_unknown";
		short_label: string; // "Friction em form" | "Quebra de confiança"
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

	// Normaliza cada candidato em JourneyReplay
	return top.map((c) => normalizeJourney(c.aggregate, c.rawEvents, c.userAgent, c.score));
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

	const pattern = classifyPattern(agg);
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
		timeline: buildTimeline(rawEvents, agg),
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

function classifyPattern(agg: SessionAggregate): JourneyReplay["pattern"] {
	if (agg.handoff_started && !agg.handoff_returned) {
		return { kind: "handoff_drop", short_label: "Não voltou do gateway externo" };
	}
	if (agg.form_retry_count > 1 || agg.input_focus_abandon_count > 0) {
		return { kind: "form_friction", short_label: "Friction em form" };
	}
	if (agg.policy_before_conversion) {
		return { kind: "trust_break", short_label: "Detour de política antes do checkout" };
	}
	if (agg.oscillation_pairs.length > 0) {
		return { kind: "oscillation", short_label: "Oscilação entre páginas" };
	}
	if (agg.pricing_then_backtrack) {
		return { kind: "trust_break", short_label: "Viu preço e recuou" };
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

function buildTimeline(rawEvents: RawEventShape[], agg: SessionAggregate): NormalizedTimelineEvent[] {
	const sorted = [...rawEvents].sort((a, b) => a.ts - b.ts);
	if (sorted.length === 0) return [];
	const startTs = sorted[0].ts;
	const events: NormalizedTimelineEvent[] = [];

	for (const ev of sorted) {
		const t = Math.round((ev.ts - startTs) / 1000);
		const path = ev.url ? stripQuery(ev.url) : null;
		const item = mapEventToTimeline(ev, t, path);
		if (item) events.push(item);
	}

	// Add exit event from aggregate
	if (agg.last_exit_page) {
		events.push({
			t_seconds: Math.round(agg.session_duration_ms / 1000),
			kind: "exit",
			label: `Abandonou em ${stripQuery(agg.last_exit_page)}`,
			path: stripQuery(agg.last_exit_page),
		});
	}

	// Cap em 18 eventos pra UI não estourar — preserva primeiros (entry)
	// e últimos (drop-off) que são os mais relevantes.
	if (events.length > 18) {
		return [...events.slice(0, 9), ...events.slice(-9)];
	}
	return events;
}

function mapEventToTimeline(
	ev: RawEventShape,
	tSeconds: number,
	path: string | null,
): NormalizedTimelineEvent | null {
	switch (ev.type) {
		case "page_view":
		case "route_change":
			return {
				t_seconds: tSeconds,
				kind: "page_enter",
				label: path ? `Entrou em ${path}` : "Nova página",
				path,
			};
		case "cta_click":
			return {
				t_seconds: tSeconds,
				kind: "cta_click",
				label: `Clicou em CTA`,
				path,
			};
		case "form_focus":
		case "input_focus":
			return {
				t_seconds: tSeconds,
				kind: "form_focus",
				label: `Focou em campo de form`,
				path,
			};
		case "form_error":
			return {
				t_seconds: tSeconds,
				kind: "form_error",
				label: `Erro em campo de form`,
				path,
			};
		case "form_retry":
		case "form_submit_retry":
			return {
				t_seconds: tSeconds,
				kind: "form_retry",
				label: `Tentou submeter form novamente`,
				path,
			};
		case "scroll_depth":
		case "scroll_milestone": {
			const depth = (ev.data?.depth as number | undefined) ?? null;
			return {
				t_seconds: tSeconds,
				kind: "scroll_milestone",
				label: depth !== null ? `Scroll ${depth}%` : "Scroll milestone",
				path,
			};
		}
		case "hesitation_pause":
			return {
				t_seconds: tSeconds,
				kind: "hesitation",
				label: `Pausou (hesitação)`,
				path,
			};
		case "backtrack":
		case "rapid_backtrack":
			return {
				t_seconds: tSeconds,
				kind: "backtrack",
				label: `Voltou pra página anterior`,
				path,
			};
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
