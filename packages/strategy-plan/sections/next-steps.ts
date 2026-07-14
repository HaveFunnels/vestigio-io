// ──────────────────────────────────────────────
// Next steps generator — top 5 actions + per-step Haiku reasoning
//
// The composite descriptive + checklist section. This is THE
// section the operator reads first ("what should I do this week?")
// so the output quality matters more than the cost optimization.
//
// Flow:
//   1. Pick top 5 OPEN actions by priorityScore (deterministic).
//   2. For each, look up REMEDIATION_CATALOG for procedure steps.
//   3. For each, ask Haiku to write a 2-paragraph "POR QUE PRIMEIRO"
//      reasoning that grounds the priority in concrete data.
//   4. Aggregate cost + return 5 NextStepOutput rows.
//
// LLM fallback path: when a Haiku call fails (cost cap, API error),
// the step still ships with a deterministic reasoning summary
// derived from the action's severity/impact/category — never empty.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, NextStepOutput, GenerationCost } from "../types";
import { callForText } from "../llm-helpers";
import { monthLabel as renderedMonthLabel } from "../i18n";
import {
	REMEDIATION_CATALOG,
	getDynamicRemediation,
} from "../../projections/remediation-catalog";
import { resolveInferenceTitle } from "../title-resolver";
import { voiceRulesFor } from "../voice-rules";

interface ActionRow {
	id: string;
	actionKey: string;
	decisionKey: string;
	category: string;
	severity: string;
	impactMin: number | null;
	impactMax: number | null;
	impactMidpoint: number | null;
	priorityScore: number;
	surface: string | null;
	inferenceKeys: string[];
}

// T3 — Calibrate severity from financial impact so the UI never shows
// "LOW · R$ 8.750/mês" or "CRITICAL · R$ 1.200/mês". Engine assigns
// severity from inference heuristics that pre-date the impact model;
// for the customer-facing plan we override based on the actual
// monetary exposure. Buckets sized for SaaS B2B (havefunnels-class
// orgs); revisit when ecom / mobile envs come online.
function calibrateSeverity(impactMidpoint: number | null): string {
	if (impactMidpoint === null) return "medium";
	if (impactMidpoint >= 5000) return "critical";
	if (impactMidpoint >= 2000) return "high";
	if (impactMidpoint >= 500) return "medium";
	return "low";
}

// T5 — Strip protocol + host from the surface string so we never
// render "em https://havefunnels.com" inside a step title. Engine
// occasionally emits surfaces as full URLs (older inference shapes);
// the plan UI expects path-only ("/" or "/checkout") so the locative
// dictionary in SURFACE_HUMAN_PT_BR can resolve it cleanly.
function normalizeSurface(surface: string | null): string | null {
	if (!surface) return surface;
	try {
		if (/^https?:\/\//i.test(surface)) {
			const u = new URL(surface);
			return u.pathname || "/";
		}
	} catch {
		// Malformed URL — fall through and keep the original string;
		// downstream humanize will at worst emit "em <surface>".
	}
	return surface;
}

function effortFromHours(h: number | null): string {
	// Reta-final: previous buckets collapsed 2-8h into "1 dia dev" so
	// every catalog entry between 3h (CTA tweak) and 8h (proof-of-work
	// rewrite) rendered identical. Customer reading 5 next steps with
	// the same effort lost trust in the calibration. New buckets:
	//   <30min · ~1h · meia tarde · meia jornada · 1 dia · 1-2 dias · 3+ dias
	// Each step now reads a distinct effort even when 3 of 5 fall in the
	// 4-8h range — meia jornada (4h) vs 1 dia (8h) reads as a planning
	// signal, not a duplicate label.
	// Customer feedback: vague buckets like "meia jornada" / "meia tarde"
	// don't communicate effort. Use absolute hours/minutes so the customer
	// can plan against a calendar.
	if (h === null) return "Não calibrado";
	if (h <= 0.5) return "Até 30 min";
	if (h <= 1.5) return "~1 hora";
	if (h <= 3) return "2-3 horas";
	if (h <= 5) return "4-5 horas";
	if (h <= 8) return "6-8 horas";
	if (h <= 16) return "1-2 dias úteis";
	if (h <= 24) return "2-3 dias úteis";
	return `${Math.round(h / 8)} dias úteis`;
}

function ownerFromCategory(category: string): string {
	// Customer-facing role labels — what kind of profile picks up this
	// move. "time eng" was opaque internal jargon.
	if (category === "incident") return "Desenvolvedor";
	if (category === "opportunity") return "Marketing";
	if (category === "verification") return "Desenvolvedor";
	return "Desenvolvedor";
}

const SURFACE_HUMAN_PT_BR: Record<string, string> = {
	"/": "na página inicial",
	"/pricing": "na página de preços",
	"/checkout": "no checkout",
	"/signup": "no cadastro",
	"/login": "no login",
	"/dashboard": "no dashboard",
	"/app": "no app",
	"/about": "na página sobre",
	"/contact": "na página de contato",
	"/blog": "no blog",
	"/faq": "no FAQ",
};

function humanizeSurface(surface: string | null, locale: string): string {
	if (!surface) return "";
	// pt-BR — replace the bare path with a friendly locative phrase so
	// "Em /" doesn't read as a leak. Fall back to "em <path>" for paths
	// not in the dictionary; users with custom routes still see the
	// exact URL and the prefix word doesn't read as broken English.
	if (locale === "pt-BR") {
		const human = SURFACE_HUMAN_PT_BR[surface];
		if (human) return ` ${human}`;
		// Generic fallback: a clean URL path stays useful
		// ("em /checkout-v2") and reads correctly in pt.
		return ` em ${surface}`;
	}
	// Other locales: keep "em <surface>" English fallback for now;
	// add localised maps when those plans regenerate at scale.
	return ` em ${surface}`;
}

// Wave 22.9 · Bloco 1 — anti-pattern refusal + alias-suffix fallback.
//
// Council on 2026-07-13 flagged that engine keys like
// `compound_trust_hesitation__checkout` were falling through the
// dictionary lookup and getting mechanically humanized into
// "Trust Hesitation Checkout no checkout" — snake_case fossil +
// surface echo. Copywriting seat's rule: refuse before render.
//
// This helper walks a chain of key variants against the translations
// dictionary. The engine's compound IDs strip surface/suffix tokens
// (my Wave 22.9 · P#3A fix), leaving stems like `trust_hesitation`
// that don't match `trust_hesitation_revenue` in the dict. Try the
// canonical suffixes (`_revenue`, `_chain`, `_risk`, `_compound`,
// `_missing_policies`) so operator-friendly translations get found
// even when the compound_type names diverge from the IDs.
const COMPOUND_ALIAS_SUFFIXES = [
	"", // exact
	"_revenue",
	"_chain",
	"_risk",
	"_compound",
	"_missing_policies",
	"_gap",
];

function resolveCompoundTitle(
	ref: string,
	translations: import("../types").GenerateContext["translations"],
): string | null {
	for (const suffix of COMPOUND_ALIAS_SUFFIXES) {
		const key = `${ref}${suffix}`;
		const hit =
			translations?.compound_type_titles?.[key] ??
			translations?.root_cause_titles?.[key] ??
			translations?.inference_titles?.[key];
		if (hit) return hit;
	}
	return null;
}

// Anti-pattern refusal per copywriting seat's rules — before ANY
// engine key gets rendered as a title, three shapes must be caught:
//   1. Snake_case fossil — raw engine tokens survived humanize
//      ("Trust Hesitation", "Compound Trust", "Chargeback Compound")
//   2. Path leak — literal URL path in the title ("em /policies")
//   3. Surface echo — same surface word twice ("Checkout no checkout")
// When any triggers, the title falls back to a generic customer-safe
// label instead of shipping the malformed string.
const FOSSIL_TOKENS = ["Compound", "Chargeback Compound", "Hesitation Revenue"];
const PATH_LITERAL_RE = /\bem \/[a-z][a-z0-9_/-]*/i;

function refuseAntiPatterns(title: string, action: ActionRow, locale: string): string {
	// (1) Snake_case fossil — raw uppercase engine tokens in the title
	for (const token of FOSSIL_TOKENS) {
		if (title.includes(token)) return safeGenericTitle(action, locale);
	}
	// (2) Path literal — "em /policies" leaked from missing surface humanize
	if (PATH_LITERAL_RE.test(title)) {
		return title.replace(PATH_LITERAL_RE, "").trim();
	}
	// (3) Surface echo — same word appears at the tail as both stem
	// and locative ("Checkout no checkout"). Detect via case-insensitive
	// substring duplication near the join.
	const lower = title.toLowerCase();
	const echoPairs: Array<[string, string]> = [
		["checkout", "no checkout"],
		["carrinho", "no carrinho"],
		["home", "na home"],
		["página inicial", "na página inicial"],
		["página de produto", "na página de produto"],
	];
	for (const [stem, locative] of echoPairs) {
		if (lower.includes(stem) && lower.endsWith(locative)) {
			return title.slice(0, title.length - locative.length).trim();
		}
	}
	return title;
}

function safeGenericTitle(action: ActionRow, locale: string): string {
	const locative = humanizeSurface(action.surface, locale).trim();
	if (locale === "pt-BR") {
		return locative ? `Vazamento identificado ${locative}` : "Vazamento identificado";
	}
	return locative ? `Revenue leak ${locative}` : "Revenue leak";
}

function titleFromAction(
	action: ActionRow,
	translations: import("../types").GenerateContext["translations"],
	locale: string,
): string {
	// Compound chains often share the FIRST triggering inference so
	// using inferenceKeys[0] collapses semantically-distinct chains
	// into the same title. For compound IDs we use the stripped
	// semantic prefix (before the surface tail `__`), then try alias
	// suffixes against the dict to find the operator-facing title.
	//
	// Bug fix 2026-07-13 (Wave 22.9 · Bloco 1) — earlier fix split on
	// `__` but the stripped stem (e.g. `trust_hesitation`) didn't
	// match `trust_hesitation_revenue` in the dict. resolveCompoundTitle
	// walks alias-suffix variants to hit the intended entry.
	const isCompound = action.decisionKey.startsWith("compound_");
	const ref = isCompound
		? action.decisionKey
			.replace(/^compound_/, "")
			.split("__")[0]
			.replace(/_+$/, "")
		: (action.inferenceKeys[0] ?? action.decisionKey);

	const translated = isCompound
		? resolveCompoundTitle(ref, translations)
		: resolveInferenceTitle(ref, translations);
	const friendly = translated
		// Collapse runs of underscores/whitespace so pathological IDs
		// don't emit double spaces after humanize.
		?? ref.replace(/_+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

	// Council rule: compound findings drop the surface locative
	// entirely — the pattern is systemic (spans pages), so a locative
	// implying one page misrepresents the finding. Non-compound
	// findings still append the humanized surface.
	const locative = isCompound ? "" : humanizeSurface(action.surface, locale);
	const raw = `${friendly}${locative}`;

	return refuseAntiPatterns(raw, action, locale);
}

/** Customer-facing humanize for the surface used inside a procedure
    redirect ("Mesma técnica do Passo N, aplicada a [surface]:"). The
    main title-resolver also humanizes surfaces but does so for titles;
    here we want a tiny preposition-friendly form ("à página inicial",
    "ao checkout") rather than the title-style ("Página inicial"). */
function humanizeSurfaceForProcedure(surface: string | null): string {
	if (!surface) return "este componente";
	const trimmed = surface.trim();
	if (trimmed === "/") return "à página inicial";
	if (trimmed === "/checkout") return "ao checkout";
	if (trimmed === "/pricing") return "à página de preços";
	if (trimmed.includes(",")) {
		return trimmed.split(",").map((s) => humanizeSurfaceForProcedure(s.trim())).join(" e ");
	}
	return `a ${trimmed}`;
}

function fallbackReasoning(action: ActionRow, order: number): string {
	// T6 — varied fallback by severity tier AND step order so 5 fallbacks
	// in a row don't read as the same sentence. We never want this
	// fallback to ship in prod (LLM is the path), but when it does fire
	// (cost-cap, API down) the reader still gets calibrated context
	// instead of boilerplate. Order matters because with severity
	// calibrated from impact, top-5 plans often hit the same severity
	// tier on every step.
	const impact = action.impactMidpoint
		? `R$ ${Math.round(action.impactMidpoint).toLocaleString("pt-BR")}/mês`
		: null;
	const isMain = order === 1;

	if (isMain) {
		// Step 1 — main move. Confident framing.
		// Reta-final: "aposta" was gambling metaphor inconsistent with
		// "Vestigio claims with data" voice. Swapped to "movimento
		// principal". "exposição" → "vazamento" / "perda potencial".
		switch (action.severity) {
			case "critical":
				return impact
					? `Esse é o movimento principal do mês. **${impact}** de perda potencial nesse ponto. O maior vazamento aberto neste ciclo. Deixar pra próxima janela amplia o impacto e atrasa o ganho dos outros passos.`
					: `Esse é o movimento principal do mês, o ponto mais crítico que detectamos. Atacar agora antes que o padrão se enraíze.`;
			case "high":
				return impact
					? `Esse é o movimento principal do mês. **${impact}** de perda potencial estimada, com barreira de entrada baixa pra resolver. Atacar primeiro destrava espaço pra os movimentos de apoio.`
					: `Esse é o movimento principal do mês. Perda potencial alta nesse ponto. Vestigio recomenda fechar antes do próximo ciclo de medição.`;
			default:
				return impact
					? `Esse é o movimento principal do mês. Não pelo tamanho do impacto isolado (**${impact}**), mas pelo desbloqueio que abre pros próximos passos.`
					: `Esse é o movimento principal do mês, começo do plano e ponto de alavanca pra os movimentos seguintes.`;
		}
	}

	// Steps 2+ — supporting moves. Reta-final: the previous template
	// closed EVERY supporting step with the same verbatim sentence
	// ("Severidade ainda alta, entra como movimento de apoio porque a
	// remediação se compõe com o passo 1 (mesmo time, padrão
	// correlacionado)"). Customer reads 2 of those and the LLM illusion
	// breaks. Now we vary the closer by severity tier AND order index
	// so 4 supporting steps produce 4 distinguishable closing beats.
	const positionPhrases = [
		"Logo atrás do movimento principal,",
		"Em paralelo,",
		"Seguindo na fila,",
		"Como suporte adicional,",
	];
	const phrase = positionPhrases[(order - 2) % positionPhrases.length];
	const supportingClosers = [
		"compõe com o Passo 1. Mesmo time, fix correlacionado.",
		"fica na mesma sprint do Passo 1 sem competir por foco.",
		"endereçar antes que o tema dominante consolide.",
		"fechar para reduzir ruído cumulativo no funil.",
	];
	const closer = supportingClosers[(order - 2) % supportingClosers.length];

	switch (action.severity) {
		case "critical":
			return impact
				? `${phrase} **${impact}** de perda potencial nesse ponto. Severidade alta. ${closer}`
				: `${phrase} ponto crítico secundário, endereçar uma vez que o movimento principal estiver em andamento.`;
		case "high":
			return impact
				? `${phrase} **${impact}** de perda potencial estimada. Não é o sangramento principal. ${closer}`
				: `${phrase} perda potencial alta nesse ponto, fechar antes do próximo ciclo de medição.`;
		case "medium":
			return impact
				? `${phrase} perda potencial em **${impact}**. Resolver reduz ruído cumulativo. Sem urgência de semana, dentro do mês.`
				: `${phrase} ponto secundário no funil. Endereçar pra liberar foco dos passos críticos.`;
		default:
			return impact
				? `${phrase} impacto modesto (**${impact}**), entra no plano como item de manutenção/polimento.`
				: `${phrase} item de baixa urgência mantido visível para evitar acúmulo silencioso.`;
	}
}

async function pickTopActions(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<ActionRow[]> {
	// Wave 22.9 · Bloco 2 — revenue-proximity re-ranking.
	//
	// The old ordering (`orderBy: priorityScore desc, take: 5`) is a
	// raw impactMidpoint sort in disguise — priorityScore inherits
	// impactMidpoint at compute time and the tiebreak is impactMidpoint
	// again. Result: SEO / discovery findings with a bigger MODELED
	// R$ estimate outrank checkout-adjacent findings with smaller but
	// AT-THE-MONEY R$. Casa Montelle's July plan led with "Páginas
	// comerciais invisíveis para busca" (R$ 20k, 90-180 days to first
	// attributable Real) over "Trust hesitation checkout" (R$ 17.5k,
	// ships this sprint) — the product-strategist council seat flagged
	// this as the algorithm treating fungible Reais that aren't.
	//
	// New shape:
	//   1. Query 15 candidates instead of 5 so the re-ranker has room.
	//   2. Re-score each candidate with revenueProximityScore().
	//   3. Take top 5 by the new score.
	//
	// The DB-level orderBy stays as a coarse pre-filter (highest raw
	// impact still bubbles to the candidate pool) but the final ranking
	// happens in memory where funnel position + executability + confidence
	// can weigh in.
	const rows = await prisma.action.findMany({
		where: {
			environmentId: ctx.environmentId,
			category: { in: ["incident", "opportunity"] },
		},
		select: {
			id: true,
			actionKey: true,
			decisionKey: true,
			category: true,
			severity: true,
			impactMin: true,
			impactMax: true,
			impactMidpoint: true,
			priorityScore: true,
			surface: true,
			projection: true, // contains linked inferences
		},
		distinct: ["decisionKey"],
		orderBy: [
			{ priorityScore: "desc" },
			{ impactMidpoint: "desc" },
			{ id: "asc" },
		],
		take: 15,
	});

	const out: ActionRow[] = [];
	for (const r of rows) {
		let inferenceKeys: string[] = [];
		try {
			const parsed = JSON.parse(r.projection);
			if (Array.isArray(parsed?.linked_findings)) {
				inferenceKeys = parsed.linked_findings
					.map((f: any) => f.inference_key)
					.filter(Boolean);
			}
		} catch {
			// Projection blob missing or malformed — that's OK, the step
			// still ships with decisionKey-derived metadata.
		}
		// T3 + T5 — calibrate severity from impact; normalize surface to
		// a path so titles never leak full URLs. Both happen at row hydration
		// so every downstream (LLM prompt, fallback reasoning, title
		// derivation, persisted plan) sees the corrected values.
		out.push({
			...r,
			severity: calibrateSeverity(r.impactMidpoint),
			surface: normalizeSurface(r.surface),
			inferenceKeys,
		});
	}

	// Tripwire — assert the rows we're about to return have distinct
	// decisionKeys. distinct in the Prisma query is the load-bearing
	// dedupe; if a future refactor drops it (e.g. someone "optimizes"
	// the query and forgets the distinct), this surfaces immediately.
	// Also catches the case where the engine emits actions with
	// confusingly-empty decisionKey strings.
	const seen = new Set<string>();
	const dupes: string[] = [];
	for (const r of out) {
		if (seen.has(r.decisionKey)) dupes.push(r.decisionKey);
		seen.add(r.decisionKey);
	}
	if (dupes.length > 0) {
		console.warn(
			`[strategy-plan] pickTopActions returned ${dupes.length} duplicate decisionKey(s). The dedupe in the query likely regressed:`,
			{ envId: ctx.environmentId, dupes, returnedCount: out.length },
		);
	}

	// Wave 22.9 · Bloco 2 — revenue-proximity re-rank. Compute a new
	// score per candidate and take the top 5. See scoreForRevenueProximity
	// for the formula.
	const scored = out.map((row) => ({
		row,
		score: scoreForRevenueProximity(row),
	}));
	scored.sort((a, b) => b.score.total - a.score.total);

	// Council hard rule: within 30% impact of each other, funnel-position
	// wins. Downstream (checkout) always beats upstream (SEO/home) pre-PMF.
	// We enforce this AFTER the base sort so a near-tie between a
	// checkout finding and an SEO finding always resolves in checkout's
	// favor even if the score formula gave SEO a marginal edge.
	scored.sort((a, b) => {
		const impactA = a.row.impactMidpoint ?? 0;
		const impactB = b.row.impactMidpoint ?? 0;
		const withinThirtyPct =
			Math.abs(impactA - impactB) / Math.max(impactA, impactB, 1) <= 0.3;
		if (withinThirtyPct) {
			const posDelta = b.score.funnelPosition - a.score.funnelPosition;
			if (posDelta !== 0) return posDelta;
		}
		return b.score.total - a.score.total;
	});
	const top = scored.slice(0, 5).map((s) => s.row);

	// Surface which candidates fell out of top-5 and why — helps ops
	// debug the ranking algorithm when a plan surprises the customer.
	console.log(
		`[strategy-plan] pickTopActions env=${ctx.environmentId} candidates=${out.length} chose=${top.length} top=${scored
			.slice(0, 5)
			.map((s) => `${s.row.decisionKey.slice(0, 24)}=${s.score.total.toFixed(0)}`)
			.join(",")}`,
	);
	return top;
}

// ──────────────────────────────────────────────
// Wave 22.9 · Bloco 2 — Revenue-proximity ranking formula
//
// Product-strategist council seat's synthesis:
//
//   Score = impactMidpoint × confidence × distance_to_money × executability
//
// Distance-to-money = calendar days to first attributable Real, encoded
// as a 0.35-1.0 multiplier. Checkout → deposits this month; SEO → 6
// months to first click on new traffic. impactMidpoint alone treats
// them as fungible Reais; they aren't.
//
// Executability = 1-sprint solo vs. needs content team vs. needs 3-month
// indexing wait. 1-3 person Brazilian ecom team pre-PMF has ONE
// execution budget per month.
//
// Confidence = severity as a proxy today (measured verificationMaturity
// upgrades land in a later wave).
//
// Pre-PMF businessPhase gate is baked in — checkout/cart/PDP/policies
// get a +30% multiplier via distance_to_money already; SEO/content/home
// take the -30% naturally.
// ──────────────────────────────────────────────

interface RankScore {
	total: number;
	impactMid: number;
	confidence: number;
	distanceToMoney: number;
	executability: number;
	funnelPosition: number;
	notes: string[];
}

function scoreForRevenueProximity(row: ActionRow): RankScore {
	const impactMid = row.impactMidpoint ?? 0;
	const confidence = confidenceFromSeverity(row.severity);
	const distanceToMoney = distanceToMoneyFor(row.surface, row.decisionKey);
	const executability = executabilityFor(row.category, row.surface, row.decisionKey);
	// Funnel position 0-100 — used as a tiebreak signal for the
	// within-30% rule. Higher = closer to money.
	const funnelPosition = Math.round(distanceToMoney * 100);
	const total = impactMid * confidence * distanceToMoney * executability;
	return {
		total,
		impactMid,
		confidence,
		distanceToMoney,
		executability,
		funnelPosition,
		notes: [],
	};
}

function confidenceFromSeverity(severity: string): number {
	switch (severity) {
		case "critical": return 1.0;
		case "high":     return 0.85;
		case "medium":   return 0.65;
		case "low":      return 0.4;
		default:         return 0.5;
	}
}

/** Distance-to-money multiplier per surface + decisionKey. Checkout
 *  and cart get the top weight; SEO / discovery / home get the bottom.
 *  Non-ecommerce surfaces fall through to a neutral default. */
function distanceToMoneyFor(surface: string | null, decisionKey: string): number {
	const key = (decisionKey ?? "").toLowerCase();
	const surf = (surface ?? "").toLowerCase();
	// Explicit money-adjacent decisionKey/surface patterns win first.
	if (/checkout|payment|handoff|gateway/.test(key) || /\/checkout/.test(surf)) return 1.0;
	if (/cart|carrinho|policies|policy|refund|return/.test(key) || /\/(cart|carrinho|policies)/.test(surf)) return 0.9;
	if (/pricing|preco|precos|planos|variant|product/.test(key) || /\/(pricing|precos?|planos|produto|product)/.test(surf)) return 0.75;
	if (/home|homepage|landing/.test(key) || surf === "/" || surf === "/home") return 0.55;
	if (/discovery|seo|search|invisible|content|blog/.test(key) || /\/(blog|conteudo)/.test(surf)) return 0.35;
	// Trust / brand-adjacent — checkout-neighbor by role even when the
	// literal surface is broader.
	if (/trust|chargeback|security_header|session_theft/.test(key)) return 0.85;
	return 0.6;
}

/** Executability multiplier. Copy/dev changes deploy in 1 sprint;
 *  content briefs take 3-6 weeks; SEO takes 3+ months of indexing.
 *  1-3 person pre-PMF team pattern. */
function executabilityFor(category: string, surface: string | null, decisionKey: string): number {
	const key = (decisionKey ?? "").toLowerCase();
	if (/seo|discovery|search|invisible|indexing/.test(key)) return 0.4;
	if (/content|blog|editorial/.test(key)) return 0.6;
	// Everything else (checkout copy, trust badges, form fixes, policy
	// pages, cta swaps, security headers) → 1.0. These deploy in a
	// single sprint solo.
	void category; void surface;
	return 1.0;
}

// Wave 22.9 · Bloco 3 — per-position angle codes. Council converged
// (page-cro + senior-prompt seats) on a 5-angle taxonomy so each
// supporting step defends its position with a DISTINCT reason rather
// than echoing "movimento de apoio, mesma sprint, compõe com Passo 1".
//
// Angle → role assignment:
//   1 → central_lever         The primary move; the alavanca.
//   2 → compounding_dependency  Same root cause as Passo 1, different bleed point.
//   3 → different_surface     Distinct axis / surface Passo 1 doesn't touch.
//   4 → quick_win             Smallest execution cost; visible payoff in days.
//   5 → cycle_trap            Not the biggest bleed, but keeps the recovered
//                              money inside the funnel next month.
// If a plan has fewer than 5 steps, angle=cycle_trap always applies
// to the last step so the closing tension lands.
type StepAngle = "central_lever" | "compounding_dependency" | "different_surface" | "quick_win" | "cycle_trap";

function angleFor(order: number, totalSteps: number): StepAngle {
	if (order === 1) return "central_lever";
	if (order === totalSteps) return "cycle_trap";
	if (order === 2) return "compounding_dependency";
	if (order === 3) return "different_surface";
	return "quick_win";
}

interface PrimaryStepContext {
	title: string;
	mechanismSummary: string;
}

// Wave 22.9 · Bloco 3 — synthesize a 1-liner "mechanism summary" for
// Passo 1 so Passos 2-5 can compose or contrast against it in the
// prompt without a sequential barrier. Uses the top inference key +
// surface + humanized. Falls back to a generic phrase when nothing
// resolves.
function buildMechanismSummary(
	action: ActionRow,
	translations: import("../types").GenerateContext["translations"],
): string {
	const primaryKey = action.inferenceKeys[0] ?? action.decisionKey;
	const humanized = resolveInferenceTitle(primaryKey, translations) ??
		primaryKey.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
	const impact = action.impactMidpoint
		? `R$ ${Math.round(action.impactMidpoint).toLocaleString("pt-BR")}/mês`
		: "vazamento aberto";
	return `${humanized} · ${impact}`;
}

function buildPrompt(
	action: ActionRow,
	order: number,
	totalSteps: number,
	envDomain: string,
	monthLabel: string,
	translations: import("../types").GenerateContext["translations"],
	vertical: string | null,
	locale: string,
	primary: PrimaryStepContext | null,
): { system: string; user: string } {
	const rules = voiceRulesFor(locale);
	const angle = angleFor(order, totalSteps);

	// Council rewrote role + voice lines per angle so each supporting
	// step has an INTRINSIC reason to exist. The "movimento de apoio"
	// framing is dropped entirely — it seeded the boilerplate.
	const roleLine =
		angle === "central_lever"
			? `Este é a alavanca central do mês. O resto do plano se desdobra a partir daqui.`
			: angle === "compounding_dependency"
				? `Este passo é a CONTINUAÇÃO MECÂNICA do Passo 1: mesma causa raiz, outro ponto onde o dinheiro sangra. Consertar o Passo 1 sem consertar este deixa a metade do vazamento aberta.`
				: angle === "different_surface"
					? `Este passo atinge uma superfície DISTINTA do Passo 1. Não é apoio, é um vazamento independente no mesmo mês. Pode rodar em paralelo em outro time sem conflito.`
					: angle === "quick_win"
						? `Este passo tem o MENOR custo de execução dos cinco. Justifique pelo retorno em HORAS, não por severidade.`
						: `Este passo consolida o que os anteriores recuperam. Não é o maior vazamento hoje, é o que faz o dinheiro ficar dentro do funil no mês seguinte.`;

	const voiceLine =
		angle === "central_lever"
			? `Tom: lead confiante. Sem hedge. Termine sinalizando que o restante do plano se desdobra daqui.`
			: angle === "compounding_dependency"
				? `Tom: composição causal. Explique a mecânica compartilhada com o Passo 1 (mesma causa, outro ponto). Nunca diga "movimento de apoio". Nunca diga "em paralelo".`
				: angle === "different_surface"
					? `Tom: eixo independente. Nomeie a superfície e o comportamento que ali quebra. Zero referência ao Passo 1.`
					: angle === "quick_win"
						? `Tom: destravamento rápido. Fale em horas, não em severidade. Zero "movimento de apoio".`
						: `Tom: contenção preventiva. Fale em "vira o vazamento de daqui X semanas se ignorado". Não fale em "apoio".`;

	// Council seat: primer the model with Passo 1's title + mechanism
	// so Passos 2+ can compose or contrast without echoing the label.
	const primaryContext = order > 1 && primary
		? `\n\nContexto (NÃO cite o título do Passo 1 pelo nome, apenas use a mecânica):\n  Mecânica do Passo 1: ${primary.mechanismSummary}\n`
		: "";

	const system = `Você é Vestigio, escrevendo a razão do passo ${order} do Plano de Estratégia mensal para ${envDomain}.

${roleLine}
${primaryContext}
Responda em ${rules.language_name}. Cada frase em ${rules.language_name}.

Vocabulário OBRIGATÓRIO: ${rules.vocab_positive}
Vocabulário PROIBIDO (não use, não parafraseie): ${rules.vocab_banned.join(", ")}

Regras:
1. Escreva 2 parágrafos curtos, ~80-100 palavras no total.
2. Use **negrito** para destacar números, severidades e nomes de componentes. Use \`código inline\` APENAS para caminhos de arquivo, props, classes CSS reais.
3. NUNCA reproduza identificadores em snake_case, slugs internos, termos como "weak_cta", "trust_boundary_crossed", "compound_*", "priorityScore", "decisionKey" ou qualquer código do engine. Use sempre os nomes humanos fornecidos.
4. NÃO use listas, NÃO use cabeçalhos, NÃO use markdown H1/H2.
5. Primeiro parágrafo: por que este vazamento merece a posição ${order} DESTE mês. Lidere com o **valor financeiro** ("R$ X.XXX/mês de vazamento") e a causa concreta. Não com "severidade alta" abstrato.
6. Segundo parágrafo: o que está em jogo se não fizer, terminando na ação concreta na página nomeada.
7. ${voiceLine}
8. Cada passo tem uma justificativa única — não repita chavões entre passos. Se este passo tem que citar o Passo 1, faça pela mecânica (mesma causa, outro ponto), nunca pela posição na fila.
9. Voz ativa, primeira pessoa do plural ("Vestigio observou", "Detectamos") quando precisar atribuir.
10. PROIBIDO travessão (—). Use ponto, vírgula, dois pontos, ou parênteses.
11. PROIBIDO exclamação. PROIBIDO emoji. PROIBIDO link.
12. Zero menção literal a "Passo 1", "Passo 2", "próximo passo", "primeiro/segundo/terceiro" — a UI mostra a numeração.`;

	// Resolve inference keys to friendly names so the LLM has no
	// raw snake_case to echo. Falls back to mechanical humanize when
	// the dict misses the key; never sends "weak_cta" through verbatim.
	const friendlyFindings = action.inferenceKeys
		.slice(0, 3)
		.map((k) => {
			const t = resolveInferenceTitle(k, translations);
			return t ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		});

	const lines: string[] = [];
	lines.push(`Ação ${order} no Plano de ${monthLabel} para ${envDomain}:`);
	lines.push(`- Severidade: ${action.severity}`);
	if (action.impactMidpoint) {
		lines.push(
			`- Impact estimado: R$ ${Math.round(action.impactMidpoint).toLocaleString("pt-BR")}/mês (range R$ ${Math.round(action.impactMin ?? 0).toLocaleString("pt-BR")} - R$ ${Math.round(action.impactMax ?? 0).toLocaleString("pt-BR")})`,
		);
	}
	if (action.surface) lines.push(`- Surface afetada: ${action.surface}`);
	if (vertical) lines.push(`- Tipo de negócio: ${vertical} (use linguagem de funil natural pra este tipo de negócio)`);
	if (friendlyFindings.length > 0) {
		lines.push(`- Findings que disparam essa ação: ${friendlyFindings.join("; ")}`);
	}
	lines.push(`- Categoria: ${action.category}`);
	lines.push("");
	lines.push("Escreva o POR QUE PRIMEIRO agora. Sem repetir os códigos do engine, apenas os nomes humanos.");
	return { system, user: lines.join("\n") };
}

export async function generateNextSteps(
	prisma: PrismaClient,
	ctx: GenerateContext,
	organizationId: string | null,
): Promise<{ steps: NextStepOutput[]; cost: GenerationCost }> {
	const month = renderedMonthLabel(ctx.month, ctx.locale);
	const actions = await pickTopActions(prisma, ctx);

	if (actions.length === 0) {
		return {
			steps: [],
			cost: { llmCallsCount: 0, llmCostCents: 0 },
		};
	}

	// Phase 2 — store inferenceKey strings directly in linkedFindingRefs.
	// Previously we resolved inferenceKey → Finding.id (a DB UUID) here
	// at generation time, but the UI drawer matches against
	// FindingProjection.id (deterministic `finding_<inferenceKey>_<suffix>`
	// strings) and inference_key, never DB UUIDs. The lookup was paying
	// to produce data that never matched anything in the consumer.
	// Drawer now matches by inference_key, so we just pass through.

	let totalCallsCount = 0;
	let totalCostCents = 0;

	// T4 — dedupe procedureSteps across consecutive steps when they share
	// the same catalog entry. Without this, two compound chains starting
	// with the same primaryKey emit identical 3-bullet procedures back-
	// to-back, which reads as machine spam. We track the running hash of
	// each step's procedure and replace duplicates with a single pointer
	// line ("Mesmo procedimento do Passo N — aplicar ao componente em X").
	//
	// T5 — same idea for locative suffix ("na página inicial"): if step N
	// would render the same locative as step N-1, the title-derived
	// locative is dropped so the reader doesn't see the same trailing
	// phrase three times in a row. We do this in a second pass after
	// titles are computed.
	const procHashByCatalog = new Map<string, number>(); // catalogKey -> first step.order using it
	const stepLocatives: string[] = [];

	// Wave 22.9 · Bloco 3 — pre-compute the primary step's mechanism
	// summary so supporting steps (order >= 2) can compose or contrast
	// with it via the prompt's `primary` context, without needing to
	// wait for Passo 1's LLM call to finish. The summary is a synthetic
	// 1-liner derived from Passo 1's top finding + surface — enough
	// signal for the model to say "same root cause, different bleed
	// point" or "different surface entirely" WITHOUT echoing the title.
	const primaryContextForSupportingSteps: PrimaryStepContext | null = actions.length > 0
		? {
			title: titleFromAction(actions[0], ctx.translations, ctx.locale),
			mechanismSummary: buildMechanismSummary(actions[0], ctx.translations),
		}
		: null;

	const totalSteps = actions.length;
	const rules = voiceRulesFor(ctx.locale);

	// Fire LLM calls in parallel (Passos 2-5 receive Passo 1's context
	// pre-computed, so no sequential barrier is needed).
	const llmResults = await Promise.all(
		actions.map(async (action, idx) => {
			const order = idx + 1;
			const primaryKey = action.inferenceKeys[0] ?? action.decisionKey;
			const catalog =
				REMEDIATION_CATALOG[primaryKey] ?? getDynamicRemediation(primaryKey);

			const primary = order === 1 ? null : primaryContextForSupportingSteps;
			const { system, user } = buildPrompt(
				action,
				order,
				totalSteps,
				ctx.envDomain,
				month,
				ctx.translations,
				ctx.businessContext?.vertical ?? null,
				ctx.locale,
				primary,
			);
			// Wave 22.9 · Bloco 3.3 — verification-with-regen loop.
			// Fire the initial call; if the output tripped any banned
			// phrase from the locale's regex, re-fire once with slightly
			// higher temperature to shake Haiku out of the same rut.
			// Cost: worst-case 2x per step, only fires when Haiku
			// smuggled a banned phrase. Empirically <5% of calls.
			const emit = async (temperature: number) =>
				callForText({
					model: "haiku_4_5",
					systemPrompt: system,
					userPrompt: user,
					maxTokens: 400,
					temperature,
					purpose: "strategy_plan.next_step_reasoning",
					organizationId,
					environmentId: ctx.environmentId,
					fallbackText: fallbackReasoning(action, order),
				});
			let reasoning = await emit(0.35);
			if (rules.banned_regex.test(reasoning.text)) {
				reasoning = await emit(0.5);
			}
			// Reset the /g regex lastIndex since we tested twice above.
			rules.banned_regex.lastIndex = 0;

			// Bug fix 2026-07-13 — the system prompt tells the model to
			// write the section without headings, but Haiku sometimes
			// complies with the section-title framing by prefixing a
			// `# ...` markdown H1. That renders on top of the position-
			// aware eyebrow in the UI, so the customer reads the same
			// header twice. Strip leading heading patterns AND scrub
			// any banned phrase the model smuggled through as a
			// belt-and-suspenders defense.
			const cleanedText = reasoning.text
				.replace(/^\s*#+\s*POR QUE PRIMEIRO\s*\n+/i, "")
				.replace(/^\s*#+\s+[^\n]*\n+/, "")
				.replace(rules.banned_regex, "")
				.replace(/\s{2,}/g, " ")
				.trimStart();
			// Reset again after the .replace scrub.
			rules.banned_regex.lastIndex = 0;

			return {
				action,
				order,
				primaryKey,
				catalog,
				reasoning: { ...reasoning, text: cleanedText },
			};
		}),
	);

	const steps: NextStepOutput[] = llmResults.map((r): NextStepOutput => {
		const { action, order, primaryKey, catalog, reasoning } = r;
		totalCallsCount += reasoning.callsCount;
		totalCostCents += reasoning.costCents;

		const linkedFindingRefs = action.inferenceKeys.filter(
			(k): k is string => typeof k === "string" && k.length > 0,
		);

		// T5 — capture and dedupe locative
		const fullTitle = titleFromAction(action, ctx.translations, ctx.locale);
		const locative = humanizeSurface(action.surface, ctx.locale).trim();
		stepLocatives.push(locative);
		// If the previous step had the same trailing locative, strip it
		// from this step's title so the reader doesn't see the same
		// "na página inicial" three lines in a row.
		const title =
			locative && stepLocatives[order - 2] === locative && fullTitle.endsWith(locative)
				? fullTitle.slice(0, fullTitle.length - locative.length).trimEnd()
				: fullTitle;

		// Reta-final: the previous T4 dedup collapsed identical procedures
		// to a single line "Mesmo procedimento do Passo N, aplicar a X" —
		// which left the second/third step procedurally empty. The
		// customer reads it as a ghost step and questions whether the
		// plan really has 5 useful next steps. Better signal: keep the
		// full procedure on every step (the small repetition reads as
		// "this fix applies here too" not "this step is a clone"), and
		// prepend a one-line context note that points back to where the
		// procedure first appeared. Customer sees: "Mesma técnica do
		// Passo N (já detalhada acima), aplicada a [surface]:" + the
		// FULL procedure repeated. No ghost, no surprise.
		const procSteps = catalog?.remediation_steps ?? [
			"Reproduzir o problema localmente",
			"Identificar o componente/arquivo afetado",
			"Implementar fix + adicionar teste de regressão",
		];
		const procHashKey = procSteps.join("\n");
		const earlierOrder = procHashByCatalog.get(procHashKey);
		let finalProcedureSteps: string[];
		if (earlierOrder !== undefined && earlierOrder < order) {
			// surfaceHint already carries the preposition ("à página
			// inicial" / "ao checkout") so the template glues directly
			// without an extra "a" (which would produce "aplicada a à").
			const surfaceHint = humanizeSurfaceForProcedure(action.surface);
			finalProcedureSteps = [
				`Mesma técnica do Passo ${earlierOrder} (já detalhada acima), aplicada ${surfaceHint}:`,
				...procSteps,
			];
		} else {
			procHashByCatalog.set(procHashKey, order);
			finalProcedureSteps = procSteps;
		}

		return {
			order,
			title,
			reasoning: reasoning.text,
			procedureSteps: finalProcedureSteps,
			researchRefs: [],
			estimatedEffort: effortFromHours(catalog?.estimated_effort_hours ?? null),
			suggestedOwner: ownerFromCategory(action.category),
			linkedActionRefs: [action.id],
			linkedFindingRefs,
			combinedImpact: {
				min: Math.round(action.impactMin ?? 0),
				max: Math.round(action.impactMax ?? 0),
				midpoint: Math.round(action.impactMidpoint ?? 0),
			},
		};
	});

	return {
		steps,
		cost: { llmCallsCount: totalCallsCount, llmCostCents: totalCostCents },
	};
}
