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
	if (h === null) return "esforço não calibrado";
	if (h <= 0.5) return "<30min";
	if (h <= 2) return "~2h";
	if (h <= 8) return "1 dia dev";
	if (h <= 16) return "1-2 dias dev";
	return `${Math.round(h / 8)} dias dev`;
}

function ownerFromCategory(category: string): string {
	if (category === "incident") return "time eng";
	if (category === "opportunity") return "time growth";
	if (category === "verification") return "time eng";
	return "time eng";
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

function titleFromAction(
	action: ActionRow,
	translations: import("../types").GenerateContext["translations"],
	locale: string,
): string {
	// Compound chains often share the FIRST triggering inference (e.g.
	// both `compound_copy_pricing_confusion__` and
	// `compound_copy_conversion_paralysis__` begin with
	// `cta_clarity_weak_on_commercial`) yet are semantically distinct
	// chains. Using inferenceKeys[0] as the title source collapsed two
	// different chains into the same human label in the plan UI
	// (havefunnels: order 1 and 2 both rendered as "Cta Clarity Weak
	// On Commercial em /"). For compound decisionKeys, use the chain
	// identifier itself — it's distinct by design.
	const isCompound = action.decisionKey.startsWith("compound_");
	const ref = isCompound
		? action.decisionKey.replace(/^compound_/, "").replace(/_+$/, "")
		: (action.inferenceKeys[0] ?? action.decisionKey);

	// Sprint 3 — consult engine translations so the title surfaces in
	// the owner's locale. Compound chains live in compound_type_titles;
	// regular inference keys flow through resolveInferenceTitle which
	// covers inference_titles + dynamic_titles (incl. parameterised
	// funnel keys like funnel_dead_end_page) + root_cause_titles.
	const translated = isCompound
		? (translations?.compound_type_titles?.[ref]
			?? translations?.root_cause_titles?.[ref]
			?? null)
		: resolveInferenceTitle(ref, translations);
	const friendly = translated
		?? ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

	const locative = humanizeSurface(action.surface, locale);
	return `${friendly}${locative}`;
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
					? `Esse é o movimento principal do mês. **${impact}** de perda potencial nesse ponto — o maior vazamento aberto neste ciclo. Deixar pra próxima janela amplia o impacto e atrasa o ganho dos outros passos.`
					: `Esse é o movimento principal do mês, o ponto mais crítico que detectamos. Atacar agora antes que o padrão se enraíze.`;
			case "high":
				return impact
					? `Esse é o movimento principal do mês. **${impact}** de perda potencial estimada, com barreira de entrada baixa pra resolver. Atacar primeiro destrava espaço pra os movimentos de apoio.`
					: `Esse é o movimento principal do mês. Perda potencial alta nesse ponto. Vestigio recomenda fechar antes do próximo ciclo de medição.`;
			default:
				return impact
					? `Esse é o movimento principal do mês — não pelo tamanho do impacto isolado (**${impact}**), mas pelo desbloqueio que abre pros próximos passos.`
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
		"compõe com o Passo 1 — mesmo time, fix correlacionado.",
		"fica na mesma sprint do Passo 1 sem competir por foco.",
		"endereçar antes que o tema dominante consolide.",
		"fechar para reduzir ruído cumulativo no funil.",
	];
	const closer = supportingClosers[(order - 2) % supportingClosers.length];

	switch (action.severity) {
		case "critical":
			return impact
				? `${phrase} **${impact}** de perda potencial nesse ponto. Severidade alta — ${closer}`
				: `${phrase} ponto crítico secundário, endereçar uma vez que o movimento principal estiver em andamento.`;
		case "high":
			return impact
				? `${phrase} **${impact}** de perda potencial estimada. Não é o sangramento principal — ${closer}`
				: `${phrase} perda potencial alta nesse ponto, fechar antes do próximo ciclo de medição.`;
		case "medium":
			return impact
				? `${phrase} perda potencial em **${impact}**. Resolver reduz ruído cumulativo — sem urgência de semana, dentro do mês.`
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
	// Dedupe at the SQL layer with `distinct: ["decisionKey"]`. Prisma
	// returns the first row per distinct combination respecting orderBy,
	// so the highest-priorityScore row per decisionKey wins. Then take 5.
	//
	// The previous implementation did `take: 12` followed by in-app
	// dedupe. For envs where many actions share a decisionKey AND tie on
	// priorityScore (e.g. 51 compound_copy_pricing_confusion__ rows all
	// at 10688), the LIMIT 12 captured 12 copies of the same key and
	// dedupe collapsed to a single next step. The plan then shipped with
	// 1 step instead of up to 5. Confirmed against havefunnels — fix
	// shifts dedupe into the query so the LIMIT counts unique keys.
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
			// Tie-break for stable ordering when priorityScore matches —
			// without this, ties yield undefined row order and the
			// "first per decisionKey" semantic becomes non-deterministic
			// across runs.
			{ impactMidpoint: "desc" },
			{ id: "asc" },
		],
		take: 5,
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
			`[strategy-plan] pickTopActions returned ${dupes.length} duplicate decisionKey(s) — the dedupe in the query likely regressed:`,
			{ envId: ctx.environmentId, dupes, returnedCount: out.length },
		);
	}

	// Surface "we have only N steps because there were only N candidates"
	// vs "we have only N steps because the engine produced one
	// decisionKey overall" so future regressions are easy to debug.
	console.log(
		`[strategy-plan] pickTopActions env=${ctx.environmentId} returned=${out.length} keys=[${[...seen].slice(0, 5).join(",")}]`,
	);
	return out;
}

function buildPrompt(
	action: ActionRow,
	order: number,
	envDomain: string,
	monthLabel: string,
	translations: import("../types").GenerateContext["translations"],
): { system: string; user: string } {
	// E2 — voice differs between the main move (order=1) and supporting
	// moves (order>=2). Main move sounds like the strategic lead;
	// supporting moves sound auxiliary. Without the difference the 5
	// steps still read as equally important even after the UI restructure.
	//
	// Reta-final: "aposta" gambling metaphor dropped — Vestigio claims
	// with data, doesn't bet. Now "movimento principal / alavanca
	// central". Voice rules also forbid "exposição" — use "perda
	// potencial" or "vazamento" instead.
	const roleLine =
		order === 1
			? `Este é o MOVIMENTO PRINCIPAL do mês — a alavanca central que o resto do plano sustenta.`
			: `Este é um MOVIMENTO DE APOIO (posição ${order}) — entra depois que o movimento principal estiver em andamento.`;
	const voiceLine =
		order === 1
			? `Tom: lead confiante. "Essa é a alavanca principal porque...". Sem hedge. Termine sinalizando que o restante do plano se desdobra a partir disso.`
			: `Tom: complementar. "Depois do movimento principal, esse entra porque...". Não compete com o passo 1 em peso — explicita por que NÃO é principal.`;

	const system = `Você é Vestigio, escrevendo a seção "POR QUE PRIMEIRO" do passo ${order} do Plano de Estratégia mensal para ${envDomain}.

${roleLine}

Vocabulário CUSTOMER-FACING obrigatório:
- "vazamento" / "perda potencial" / "receita em risco", NÃO "exposição"
- "página" / "página inicial" / "checkout", NÃO "surface" nem "\`/\`" literal
- "movimento principal" / "alavanca", NÃO "aposta" (Vestigio AFIRMA com base em dado)

Regras:
1. Escreva 2 parágrafos curtos em português brasileiro, ~80-100 palavras no total.
2. Use **negrito** para destacar números, severidades e nomes de componentes. Use \`código inline\` APENAS para nomes técnicos reais (caminhos de arquivo, props, classes CSS).
3. NUNCA reproduza identificadores em snake_case, slugs internos, termos como "weak_cta", "trust_boundary_crossed", "compound_*", "priorityScore", "decisionKey" ou qualquer outro código do engine. Use sempre os nomes humanos fornecidos.
4. NÃO use listas, NÃO use cabeçalhos.
5. Primeiro parágrafo: por que esse passo é prioritário. Lidere com o **valor financeiro** ("R$ X.XXX/mês de vazamento") e o contexto da causa — não com "severidade alta" abstrato.
6. Segundo parágrafo: o que está em jogo se não fizer (impacto composto, dependência com outro passo, prazo). Termine indicando a ação concreta.
7. ${voiceLine}
8. PROIBIDO escrever "Resolver esse item primeiro", "no topo da fila de prioridade", "porque ele aparece no topo" ou variantes. Cada passo tem uma justificativa única, não repita boilerplate de ranqueamento.
9. PROIBIDO repetir a MESMA frase de fechamento que outros passos: nunca escreva variantes literais de "compõe com o passo 1", "mesmo time, padrão correlacionado", "movimento de apoio porque a remediação se compõe". Cada passo tem um motivo PRÓPRIO para estar nessa posição — diga esse motivo, não um chavão.
10. NÃO mencione "o engine", "a análise revelou", "foi capturado" ou outras passivas. Voz ativa, primeira pessoa do plural ("Vestigio observou", "Detectamos") quando precisar atribuir.
11. PROIBIDO travessão (—) em qualquer parte do texto. Use ponto, vírgula, dois pontos, ou parênteses. Travessão é tic de LLM e identifica o texto como gerado.
12. PROIBIDO a palavra "exposição" — substituir por "vazamento", "perda potencial" ou "receita em risco" conforme o contexto.`;

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
	if (friendlyFindings.length > 0) {
		lines.push(`- Findings que disparam essa ação: ${friendlyFindings.join("; ")}`);
	}
	lines.push(`- Categoria: ${action.category}`);
	lines.push("");
	lines.push("Escreva o POR QUE PRIMEIRO agora — sem repetir os códigos do engine, apenas os nomes humanos.");
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

	// Fire LLM calls in parallel (they don't depend on each other), then
	// stitch in the order-dependent dedupe pass.
	const llmResults = await Promise.all(
		actions.map(async (action, idx) => {
			const order = idx + 1;
			const primaryKey = action.inferenceKeys[0] ?? action.decisionKey;
			const catalog =
				REMEDIATION_CATALOG[primaryKey] ?? getDynamicRemediation(primaryKey);

			const { system, user } = buildPrompt(action, order, ctx.envDomain, month, ctx.translations);
			const reasoning = await callForText({
				model: "haiku_4_5",
				systemPrompt: system,
				userPrompt: user,
				maxTokens: 400,
				temperature: 0.35,
				purpose: "strategy_plan.next_step_reasoning",
				organizationId,
				environmentId: ctx.environmentId,
				fallbackText: fallbackReasoning(action, order),
			});

			return { action, order, primaryKey, catalog, reasoning };
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
