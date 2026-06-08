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

function titleFromAction(action: ActionRow): string {
	// Compound chains often share the FIRST triggering inference (e.g.
	// both `compound_copy_pricing_confusion__` and
	// `compound_copy_conversion_paralysis__` begin with
	// `cta_clarity_weak_on_commercial`) yet are semantically distinct
	// chains. Using inferenceKeys[0] as the title source collapsed two
	// different chains into the same human label in the plan UI
	// (havefunnels: order 1 and 2 both rendered as "Cta Clarity Weak
	// On Commercial em /"). For compound decisionKeys, use the chain
	// identifier itself — it's distinct by design and reads better
	// than picking some inference inside the chain. For non-compound
	// keys, inferenceKeys[0] still reads as the most specific cause.
	const isCompound = action.decisionKey.startsWith("compound_");
	const ref = isCompound
		? action.decisionKey.replace(/^compound_/, "").replace(/_+$/, "")
		: (action.inferenceKeys[0] ?? action.decisionKey);
	const friendly = ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	if (action.surface) return `${friendly} em ${action.surface}`;
	return friendly;
}

function fallbackReasoning(action: ActionRow): string {
	const sev = action.severity.toUpperCase();
	const impact = action.impactMidpoint
		? `R$ ${Math.round(action.impactMidpoint).toLocaleString("pt-BR")}/mo`
		: "impact não calibrado";
	return `Severidade **${sev}** com impacto estimado em **${impact}**. Resolver esse item primeiro porque ele aparece no topo da fila de prioridade do engine (\`priorityScore=${action.priorityScore}\`).`;
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
		out.push({ ...r, inferenceKeys });
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
): { system: string; user: string } {
	const system = `Você escreve a seção "POR QUE PRIMEIRO" do passo ${order} do Plano de Estratégia mensal para ${envDomain}.

Regras:
1. Escreva 2 parágrafos curtos em português brasileiro, ~80-100 palavras no total.
2. Use **negrito** para destacar números, severidades e nomes de componentes. Use \`código inline\` para nomes técnicos (caminhos de arquivo, props, classes CSS).
3. NÃO use listas, NÃO use cabeçalhos.
4. Primeiro parágrafo: por que esse passo é prioritário (severidade + impacto + contexto da causa).
5. Segundo parágrafo: urgência calibrada (custo de NÃO fazer + dependências com outros passos se aplicável).
6. Tom factual, sem hype. Se faltar dado pra justificar urgência alta, dê uma justificativa mais modesta.`;

	const lines: string[] = [];
	lines.push(`Ação ${order} no Plano de ${monthLabel} para ${envDomain}:`);
	lines.push(`- Severidade: ${action.severity}`);
	if (action.impactMidpoint) {
		lines.push(
			`- Impact estimado: R$ ${Math.round(action.impactMidpoint).toLocaleString("pt-BR")}/mês (range R$ ${Math.round(action.impactMin ?? 0).toLocaleString("pt-BR")} - R$ ${Math.round(action.impactMax ?? 0).toLocaleString("pt-BR")})`,
		);
	}
	if (action.surface) lines.push(`- Surface afetada: ${action.surface}`);
	if (action.inferenceKeys.length > 0) {
		lines.push(`- Findings que disparam essa ação: ${action.inferenceKeys.slice(0, 3).join(", ")}`);
	}
	lines.push(`- Categoria: ${action.category}`);
	lines.push(`- priorityScore: ${action.priorityScore}`);
	lines.push("");
	lines.push("Escreva o POR QUE PRIMEIRO agora.");
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

	// Phase 2 — resolve inferenceKeys → Finding.id for every step in a
	// single batch query. The drill-down (`/app/findings?step=<id>`)
	// reads the persisted Finding.id list directly, so generation pays
	// the lookup once instead of paying it per page-load. We scope to
	// the env's findings (any cycle, NOT just the latest) so steps
	// that bundle older issues still resolve correctly.
	const allInferenceKeys = Array.from(
		new Set(actions.flatMap((a) => a.inferenceKeys)),
	);
	const findingRows = allInferenceKeys.length === 0
		? []
		: await prisma.finding.findMany({
				where: {
					environmentId: ctx.environmentId,
					inferenceKey: { in: allInferenceKeys },
					status: { in: ["created", "confirmed", "regressed"] },
				},
				select: { id: true, inferenceKey: true, createdAt: true },
				orderBy: { createdAt: "desc" },
			});
	// Map inferenceKey → most recent Finding.id. Multiple cycles can
	// produce duplicate inferenceKeys; the latest is the canonical one
	// the UI should show.
	const findingIdByKey = new Map<string, string>();
	for (const r of findingRows) {
		if (!findingIdByKey.has(r.inferenceKey)) {
			findingIdByKey.set(r.inferenceKey, r.id);
		}
	}

	let totalCallsCount = 0;
	let totalCostCents = 0;

	const steps = await Promise.all(
		actions.map(async (action, idx): Promise<NextStepOutput> => {
			const order = idx + 1;
			const primaryKey = action.inferenceKeys[0] ?? action.decisionKey;
			const catalog =
				REMEDIATION_CATALOG[primaryKey] ?? getDynamicRemediation(primaryKey);

			const { system, user } = buildPrompt(action, order, ctx.envDomain, month);
			const reasoning = await callForText({
				model: "haiku_4_5",
				systemPrompt: system,
				userPrompt: user,
				maxTokens: 400,
				temperature: 0.35,
				purpose: "strategy_plan.next_step_reasoning",
				organizationId,
				environmentId: ctx.environmentId,
				fallbackText: fallbackReasoning(action),
			});

			totalCallsCount += reasoning.callsCount;
			totalCostCents += reasoning.costCents;

			const linkedFindingRefs = action.inferenceKeys
				.map((k) => findingIdByKey.get(k))
				.filter((id): id is string => typeof id === "string");

			return {
				order,
				title: titleFromAction(action),
				reasoning: reasoning.text,
				procedureSteps: catalog?.remediation_steps ?? [
					"Reproduzir o problema localmente",
					"Identificar o componente/arquivo afetado",
					"Implementar fix + adicionar teste de regressão",
				],
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
		}),
	);

	return {
		steps,
		cost: { llmCallsCount: totalCallsCount, llmCostCents: totalCostCents },
	};
}
