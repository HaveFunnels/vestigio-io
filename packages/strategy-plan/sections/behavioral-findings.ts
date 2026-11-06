// ──────────────────────────────────────────────
// Measured friction as structured findings.
//
// The measurement pipeline was the one analytic path that bypassed
// Finding entirely: behavioral-measurement.ts has zero references to
// it and renders straight into the plan. The consequence was that the
// only genuinely differentiated content in the product had no
// lifecycle — no new/persistent/resolved, no place in
// /app/findings, and no way to be prioritised against crawler
// findings.
//
// This converts eligible measurements into FindingProjections so they
// join the lifecycle that already exists. It does NOT change what any
// measurement means.
//
// Three rules govern what gets through, because "a detector fired" is
// not the same as "there is a problem":
//
//   1. SUFFICIENCY. A rate over a trickle is noise. A page needs a
//      real session count before a percentage about it is allowed to
//      exist, and the count travels with the finding.
//
//   2. NOT A DEFECT. claim_type is always 'behavioral' and severity is
//      capped below 'critical'. A high friction rate is a measurement
//      whose CAUSE is unknown: Casa Montelle loses 94.4% between
//      product and cart and nothing in the system can say why.
//      Promoting that to a critical defect would be inventing a
//      diagnosis.
//
//   3. NO INVENTED MONEY. impact is zero, which here means "not
//      modelled", not "no impact". These are counts, and the audit's
//      own rule is that the plan may not attach fabricated revenue to
//      them.
//
// Emission is gated by a flag and defaults OFF, because hero-metrics
// aggregates Finding rows: emitting these would silently move the
// numbers in the existing plan. Phase 1 is about having the source of
// truth, not about changing the deliverable.
// ──────────────────────────────────────────────

import type { FindingProjection } from "../../projections/types";
import { measuredMagnitude, type MeasuredMagnitude } from "../measured-magnitude";
import type { FrictionPageStats, MeasuredFrictionOutput } from "./measured-friction";

/**
 * Off unless explicitly enabled. The plan must behave exactly as
 * before in Phase 1, and that is only provable if nothing is written.
 */
export function areBehavioralFindingsEnabled(): boolean {
	return process.env.BEHAVIORAL_FINDINGS_ENABLED === "true";
}

/**
 * Sessions a page needs before a friction percentage about it may
 * become a finding.
 *
 * Higher than the plan's display floor (30) on purpose. Appearing in
 * a ranked list is a weaker claim than being a tracked finding with a
 * lifecycle, so the bar to become one is higher.
 */
export const MIN_SESSIONS_FOR_FINDING = 200;

/** Distinct sessions that must show the friction, so one rage-clicking
 *  visitor cannot create a finding on their own. */
export const MIN_AFFECTED_SESSIONS = 25;

/** Below this rate the measurement is real but unremarkable. */
export const MIN_FRICTION_RATE_PCT = 5;

/**
 * Occurrences a single friction KIND needs on its own.
 *
 * The page-level gates above qualify the page, not each kind on it. A
 * dry run against Casa Montelle emitted "1 input abandoned" and "5
 * form retries" on a page with 4,179 sessions, because the page itself
 * cleared every floor. A finding with a count of 1 is noise wearing a
 * lifecycle.
 */
export const MIN_COUNT_PER_KIND = 20;

/** One stable key per friction kind. Identity for the lifecycle is
 *  (environmentId, inferenceKey, surface), so the key must not encode
 *  the page or the counts. */
export const FRICTION_INFERENCE_KEYS = {
	deadClicks: "measured_dead_clicks",
	hesitationsNearCta: "measured_hesitation_near_cta",
	inputAbandons: "measured_input_abandon",
	formRetries: "measured_form_retry",
	backtracks: "measured_immediate_backtrack",
} as const;

type FrictionKind = keyof typeof FRICTION_INFERENCE_KEYS;

/**
 * What the reader is told this finding is, in their own words.
 *
 * Without these the plan printed the raw inference key
 * ("measured_dead_clicks") as the headline. Caught by the dry run:
 * five priorities in a row named after machine identifiers.
 */
const FRICTION_TITLES: Record<FrictionKind, (entity: string) => string> = {
	deadClicks: (e) => `Cliques que não respondem em "${e}"`,
	hesitationsNearCta: (e) => `Hesitação na frente do botão de compra em "${e}"`,
	inputAbandons: (e) => `Campos de formulário abandonados em "${e}"`,
	formRetries: (e) => `Tentativas repetidas de formulário em "${e}"`,
	backtracks: (e) => `Entradas com saída imediata em "${e}"`,
};

/** What was COUNTED, per kind. Not a cause: a count.
 *
 *  These five fields were absent entirely, so the findings with the
 *  highest confidence in the whole document (conf 80 to 90, the only
 *  ones actually measured) reached the customer rendering "causa:
 *  undefined efeito: undefined razao: undefined". Three independent
 *  reviewers caught it in the same plan, and one of them put it
 *  exactly right: the metade of the plan with the most confidence
 *  arrives with undefined fields while the heuristic half is well
 *  written. */
const FRICTION_CAUSES: Record<FrictionKind, string> = {
	deadClicks: "O comprador clicou em algo que não respondeu",
	hesitationsNearCta: "O comprador parou em frente ao botão de compra sem clicar",
	inputAbandons: "O comprador começou a preencher um campo e desistiu dele",
	formRetries: "O comprador enviou o mesmo formulário várias vezes",
	backtracks: "O comprador entrou na página e saiu imediatamente",
};

/** What it costs. Stated as consequence, never as diagnosis: a count
 *  tells you WHERE the buyer stopped, never WHY. */
const FRICTION_EFFECTS: Record<FrictionKind, string> = {
	deadClicks:
		"Cada clique sem resposta ensina o comprador que a página não funciona, e ele para de tentar antes de chegar ao que funciona",
	hesitationsNearCta:
		"A pausa na frente do botão é dúvida não respondida na tela, e dúvida no momento do pagamento vira aba fechada",
	inputAbandons:
		"Campo abandonado é compra abandonada: quem para de preencher no meio raramente volta e começa de novo",
	formRetries:
		"Reenviar o mesmo formulário significa que o erro não disse o que corrigir, e a paciência acaba antes do acerto",
	backtracks:
		"Entrar e sair na hora significa que a página não era o que o comprador esperava encontrar ali",
};

/** The concrete thing to look at, per kind. Generic advice would be
 *  the catalogue slop this product exists to avoid. */
const FRICTION_ACTIONS: Record<FrictionKind, string> = {
	deadClicks:
		"Encontre o elemento que parece clicável e não faz nada: imagem, ícone ou texto com estilo de link sem destino.",
	hesitationsNearCta:
		"Leia o que está ao redor do botão de compra. Pausa longa ali costuma ser dúvida de preço, frete ou segurança não respondida na tela.",
	inputAbandons:
		"Percorra o formulário campo a campo e veja qual exige informação que o comprador não tem em mãos ou não entende por que você pede.",
	formRetries:
		"Submeta o formulário de propósito com erros comuns e veja se a mensagem diz o que corrigir e onde.",
	backtracks:
		"Abra a página pelo mesmo caminho do anúncio e compare a primeira tela com o que o anúncio prometeu.",
};

export interface BehavioralFindingInput {
	friction: MeasuredFrictionOutput | null | undefined;
	windowStart: string;
	windowEnd: string;
	/** Declared monthly revenue for THIS environment, not the
	 *  organization's. BusinessProfile is per-org and one org here owns
	 *  both a store and a SaaS, so an org-scoped figure would price the
	 *  store with the SaaS's numbers. Null when undeclared, and the
	 *  magnitude is then omitted rather than invented. */
	monthlyRevenueBrl?: number | null;
	/** Total sessions the window measured, the denominator. */
	measuredSessions?: number | null;
}

/** Why a page produced no finding — returned so a dry run can explain
 *  itself instead of just showing an empty list. */
export interface Rejection {
	path: string;
	reason: string;
}

export interface BehavioralFindingsResult {
	findings: FindingProjection[];
	rejections: Rejection[];
}

/**
 * Severity from magnitude, capped.
 *
 * Never 'critical': that tier is for a state of the site, and this is
 * a count whose cause is unknown. 'high' requires both a large
 * affected population and a high rate, so a small page with a scary
 * percentage cannot reach it.
 */
function severityFor(ratePct: number, affected: number): "high" | "medium" | "low" {
	if (ratePct >= 25 && affected >= 500) return "high";
	if (ratePct >= 10) return "medium";
	return "low";
}

/**
 * Confidence from sample size, not from how bad the number looks.
 *
 * A 40% rate over 210 sessions is less trustworthy than a 12% rate
 * over 30,000, and confidence is the field that should carry that.
 */
function confidenceFor(sessions: number): number {
	if (sessions >= 10_000) return 90;
	if (sessions >= 2_000) return 80;
	if (sessions >= 500) return 70;
	return 60;
}

function countFor(pg: FrictionPageStats, kind: FrictionKind): number {
	switch (kind) {
		case "deadClicks":
			return pg.deadClicks;
		case "hesitationsNearCta":
			return pg.hesitationsNearCta;
		case "inputAbandons":
			return pg.inputAbandons;
		case "formRetries":
			return pg.formRetries;
		case "backtracks":
			return pg.backtracks;
	}
}

/**
 * Build findings from measured friction.
 *
 * Deduplication: one finding per friction KIND, not per (kind, page).
 *
 * That is forced by storage, and I had it wrong first. Finding is
 * unique on (cycleId, inferenceKey) — surface is NOT part of the
 * constraint — so three pages sharing a kind collapsed into one row
 * whose surface became the comma-joined string
 * "/c/NX-…, /products/vedaplus-kit, /". Nine projections became five
 * rows with corrupted identity, which also breaks the lifecycle, whose
 * identity is (environmentId, inferenceKey, surface).
 *
 * Encoding the page into the inference key would restore per-page
 * granularity, but it makes key cardinality unbounded and
 * INFERENCE_TO_PACK cannot enumerate them, which an invariant checks.
 * Widening the unique index is a migration on the largest related
 * table and is not a Phase 1 change.
 *
 * So: one finding per kind, surface = the page carrying the most of
 * it, and every page's numbers preserved in the evidence array. The
 * per-page detail survives; only the ability to resolve one page
 * independently of another is deferred.
 */
/** Magnitude for a measured finding, or null. Deliberately NOT written
 *  into impact.midpoint: openLossExposure sums that column, and mixing
 *  a measured magnitude into a heuristic sum would double-count the
 *  revenue that overlapping findings each describe. */
function magnitudeFor(
	input: BehavioralFindingInput,
	affectedSessions: number,
): MeasuredMagnitude | null {
	return measuredMagnitude(
		affectedSessions,
		input.measuredSessions ?? input.friction?.sampleSessions ?? null,
		input.monthlyRevenueBrl ?? null,
	);
}

export function buildBehavioralFindings(
	input: BehavioralFindingInput,
): BehavioralFindingsResult {
	const out: BehavioralFindingsResult = { findings: [], rejections: [] };
	const pages = input.friction?.pages ?? [];
	const qualified: FrictionPageStats[] = [];

	for (const pg of pages) {
		if (pg.sessions < MIN_SESSIONS_FOR_FINDING) {
			out.rejections.push({
				path: pg.path,
				reason: `${pg.sessions} sessions < ${MIN_SESSIONS_FOR_FINDING} floor`,
			});
			continue;
		}
		if (pg.sessionsWithFriction < MIN_AFFECTED_SESSIONS) {
			out.rejections.push({
				path: pg.path,
				reason: `${pg.sessionsWithFriction} affected sessions < ${MIN_AFFECTED_SESSIONS}`,
			});
			continue;
		}
		if (pg.frictionRatePct < MIN_FRICTION_RATE_PCT) {
			out.rejections.push({
				path: pg.path,
				reason: `${pg.frictionRatePct}% rate < ${MIN_FRICTION_RATE_PCT}%`,
			});
			continue;
		}

		qualified.push(pg);
	}

	// Group by kind across the qualified pages.
	const kinds = Object.keys(FRICTION_INFERENCE_KEYS) as FrictionKind[];
	for (const kind of kinds) {
		const counted = qualified.map((pg) => ({ pg, count: countFor(pg, kind) }));
		// Record why a page's contribution was dropped, so the dry run
		// can explain itself rather than showing a silently shorter list.
		for (const x of counted) {
			if (x.count > 0 && x.count < MIN_COUNT_PER_KIND) {
				out.rejections.push({
					path: x.pg.path,
					reason: `${kind}=${x.count} < ${MIN_COUNT_PER_KIND} occurrences`,
				});
			}
		}
		const contributing = counted
			.filter((x) => x.count >= MIN_COUNT_PER_KIND)
			.sort((a, b) => b.count - a.count);
		if (contributing.length === 0) continue;

		// Surface is the page carrying the most of this friction. It is
		// the lifecycle identity, so it has to be deterministic.
		const lead = contributing[0];
		const totalSessions = contributing.reduce((n, x) => n + x.pg.sessions, 0);

		out.findings.push({
			inference_key: FRICTION_INFERENCE_KEYS[kind],
			title: FRICTION_TITLES[kind](lead.pg.label || lead.pg.path),
			root_cause: FRICTION_ACTIONS[kind],
			cause: FRICTION_CAUSES[kind],
			effect: FRICTION_EFFECTS[kind],
			reasoning:
				`${lead.count} ocorrências em ${lead.pg.sessions} sessões de ` +
				`"${lead.pg.label || lead.pg.path}", ou seja ${lead.pg.frictionRatePct}% ` +
				`das sessões com atrito nesta página. Contagem direta do pixel, ` +
				`não estimativa.`,
			// 'measured' is the honest value and the one the plan's
			// language rules key off: a count may describe what happened
			// and may never assert why.
			basis_type: "measured",
			source_url: lead.pg.path,
			// Upper bound on the sessions this KIND of friction touched.
			//
			// The aggregates give occurrences per kind and friction
			// sessions per page, never sessions per kind: one session can
			// dead-click five times. So the true figure is unknown and
			// bounded by both, and min() is the only honest statement
			// available.
			//
			// Using the page's friction sessions alone was the first
			// attempt and it gave all five kinds the IDENTICAL magnitude
			// (R$ 7,887 each on the live cycle), which a reader spots
			// instantly and which is false: 88 form retries and 2,382
			// abandoned fields cannot carry the same weight.
			measured_magnitude: magnitudeFor(
				input,
				Math.min(lead.count, lead.pg.sessionsWithFriction),
			),
			pack: "behavioral",
			severity: severityFor(lead.pg.frictionRatePct, lead.pg.sessionsWithFriction),
			polarity: "negative",
			confidence: confidenceFor(totalSessions),
			// Zero means NOT MODELLED. These are counts, and the plan is
			// not allowed to attach fabricated revenue to them.
			impact: { monthly_range: { min: 0, max: 0 }, midpoint: 0 },
			surface: lead.pg.path,
			surface_kind: "public",
			origin: "pixel",
			claim_type: "behavioral",
			change_class: null,
			verification_maturity: "verified",
			// Every contributing page keeps its own numbers, so the
			// per-page detail is not lost by grouping.
			evidence: contributing.map((x) => ({
				kind: "measured_count",
				path: x.pg.path,
				label: x.pg.label,
				friction_kind: kind,
				count: x.count,
				sessions: x.pg.sessions,
				sessions_with_friction: x.pg.sessionsWithFriction,
				friction_rate_pct: x.pg.frictionRatePct,
				window_start: input.windowStart,
				window_end: input.windowEnd,
			})),
		} as unknown as FindingProjection);
	}

	// ── One product, several URLs ──
	//
	// measured-friction already finds this and the plan already shows it
	// in behavioralJson, and it never became a finding. On the 2026-11
	// plan of a paying customer that meant the single most valuable
	// number in the document had no title, no priority and no step:
	// 37,506 measured sessions split across four URLs serving the same
	// product. Four independent reviewers reading the plan picked it out
	// as the best datum in it and asked why it was not step one.
	//
	// Emitted here rather than in a pack because it rests on counted
	// sessions per URL, which only the pixel has. Impact stays 0: this
	// is a count, and the plan may not attach a modelled loss to it.
	for (const dup of input.friction?.duplicateEntities ?? []) {
		if (dup.paths.length < 2) continue;
		if (dup.totalSessions < MIN_SESSIONS_FOR_FINDING) {
			out.rejections.push({
				path: dup.paths[0]?.path ?? dup.label,
				reason: `duplicate entity ${dup.totalSessions} sessions < ${MIN_SESSIONS_FOR_FINDING} floor`,
			});
			continue;
		}
		const lead = dup.paths[0];
		const others = dup.paths.length - 1;
		out.findings.push({
			inference_key: "duplicate_entity_splits_traffic",
			title: `Um produto seu atende em ${dup.paths.length} endereços diferentes`,
			cause: `"${dup.label}" está publicado em ${dup.paths.length} endereços diferentes`,
			effect:
				`O tráfego, as avaliações e o sinal de busca desse produto estão ` +
				`divididos em ${dup.paths.length}, então nenhum dos endereços acumula ` +
				`a reputação que o produto já ganhou`,
			reasoning:
				`${dup.totalSessions} sessões medidas chegaram a "${dup.label}" ` +
				`repartidas assim: ${dup.paths
					.map((x) => `${x.path} (${x.sessions})`)
					.join(", ")}. Contagem direta do pixel, não estimativa.`,
			basis_type: "measured",
			source_url: lead.path,
			measured_magnitude: magnitudeFor(input, dup.totalSessions),
			root_cause:
				`Escolha um endereço como o oficial para "${dup.label}", aponte os outros ` +
				`${others} para ele com redirecionamento permanente e atualize os links de ` +
				`anúncio e de catálogo. Hoje review, prova social e sinal de busca estão ` +
				`divididos em ${dup.paths.length}.`,
			pack: "behavioral",
			// Severity from how much traffic is being split, not from a
			// guess: a product with most of the store's sessions spread
			// over several URLs is a different problem from a long tail.
			severity: dup.totalSessions >= 10_000 ? "high" : "medium",
			polarity: "negative",
			confidence: confidenceFor(dup.totalSessions),
			impact: { monthly_range: { min: 0, max: 0 }, midpoint: 0 },
			surface: lead.path,
			surface_kind: "public",
			origin: "pixel",
			claim_type: "behavioral",
			change_class: null,
			verification_maturity: "verified",
			evidence: dup.paths.map((x) => ({
				kind: "measured_count",
				path: x.path,
				label: dup.label,
				sessions: x.sessions,
				window_start: input.windowStart,
				window_end: input.windowEnd,
			})),
		} as unknown as FindingProjection);
	}

	return out;
}
