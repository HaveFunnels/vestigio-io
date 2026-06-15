// ──────────────────────────────────────────────
// Value preview narrative — single Haiku call (~$0.001)
//
// Personalizes the "O que você ganha continuando" callout based on
// where the env is on its lifecycle: cycle count, integrations
// connected, time since first audit. The structured timeline above
// is generated deterministically; this is the human paragraph
// underneath that ties it together.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, ValuePreviewOutput } from "../types";
import { callForText, type LlmTextResult } from "../llm-helpers";

interface PreviewInputs {
	envDomain: string;
	envAgeMonths: number;
	cycleCount: number;
	hasCrossSourceSignal: boolean;
	nextMilestoneMonths: number | null;
	nextMilestoneLabel: string | null;
}

async function gatherInputs(
	prisma: PrismaClient,
	ctx: GenerateContext,
	preview: ValuePreviewOutput,
): Promise<PreviewInputs> {
	const first = await prisma.auditCycle.findFirst({
		where: { environmentId: ctx.environmentId },
		orderBy: { createdAt: "asc" },
		select: { createdAt: true },
	});
	const cycleCount = await prisma.auditCycle.count({
		where: { environmentId: ctx.environmentId, status: "complete" },
	});
	const envAgeMonths = first
		? Math.max(
			0,
			(ctx.monthStart.getTime() - first.createdAt.getTime()) / (30 * 86400000),
		)
		: 0;

	let hasCrossSourceSignal = false;
	try {
		const conn = await prisma.integrationConnection.findFirst({
			where: { environmentId: ctx.environmentId, status: "connected" },
			select: { id: true },
		});
		hasCrossSourceSignal = !!conn;
	} catch {
		hasCrossSourceSignal = false;
	}

	// Next milestone = first marker still "pending" or "future".
	let nextMilestoneMonths: number | null = null;
	let nextMilestoneLabel: string | null = null;
	for (const [label, key] of [
		["M3", "milestoneM3"],
		["M6", "milestoneM6"],
		["M12", "milestoneM12"],
	] as const) {
		const m = preview[key];
		if (m.icon !== "check") {
			nextMilestoneLabel = label;
			const target = label === "M3" ? 3 : label === "M6" ? 6 : 12;
			nextMilestoneMonths = Math.max(0, target - Math.round(envAgeMonths));
			break;
		}
	}

	return {
		envDomain: ctx.envDomain,
		envAgeMonths: Math.round(envAgeMonths),
		cycleCount,
		hasCrossSourceSignal,
		nextMilestoneMonths,
		nextMilestoneLabel,
	};
}

function fallback(i: PreviewInputs): string {
	// T9 — fallback rewritten to name a CONCRETE unlock per milestone
	// instead of the vague "destrava análises mais específicas" hedge.
	// Vocabulary scrubbed: "o engine" (-> Vestigio), "destravar"
	// (-> entregar/abrir), so the customer hears a product person
	// talking, not a developer.
	if (i.nextMilestoneLabel && i.nextMilestoneMonths !== null) {
		const monthsTxt =
			i.nextMilestoneMonths <= 0
				? "neste mês"
				: i.nextMilestoneMonths === 1
					? "em 1 mês"
					: `em ${i.nextMilestoneMonths} meses`;
		const unlock =
			i.nextMilestoneLabel === "M3"
				? "Vestigio começa a correlacionar findings com receita real (via Stripe e behavioral). Análise sai do plano e vira atribuição direta"
				: i.nextMilestoneLabel === "M6"
					? "comparativo vs. categoria liga: você vê onde está acima e abaixo dos seus pares"
					: "histórico suficiente pro Vestigio prever regressões antes delas afetarem receita. Manutenção vira preventiva, não reativa";
		return `Você está há **${i.envAgeMonths} ${i.envAgeMonths === 1 ? "mês" : "meses"}** com Vestigio. Próximo marco: **${i.nextMilestoneLabel}** ${monthsTxt}. A partir daí, ${unlock}.`;
	}
	return `Você completou **${i.cycleCount} ciclos** com Vestigio. Histórico suficiente pra prever regressões antes delas afetarem receita.`;
}

function buildPrompt(i: PreviewInputs): { system: string; user: string } {
	const system = `Você escreve um parágrafo curto (máximo 2 frases, ~50 palavras) para a seção "O que você ganha continuando" de um Plano de Estratégia.

Regras:
1. Apenas 1-2 frases, português brasileiro. Voz ativa. Pode usar "Vestigio" como sujeito.
2. Use **negrito** para destacar o tempo, o número do marco, e o desbloqueio concreto.
3. Não invente métricas, use apenas os dados fornecidos.
4. Tom natural, conversacional, sem hype.
5. PROIBIDO usar "o engine", "a análise revelou", "destrava" (use "entrega", "abre", "começa a"). PROIBIDO promessa vaga ("análises mais específicas"); nomeie um desbloqueio concreto.
6. PROIBIDO travessão (—) em qualquer parte do texto. Use ponto, vírgula, dois pontos, ou parênteses.`;

	const lines: string[] = [];
	lines.push(`Dados do ambiente ${i.envDomain}:`);
	lines.push(`- Tempo com Vestigio: ${i.envAgeMonths} ${i.envAgeMonths === 1 ? "mês" : "meses"}`);
	lines.push(`- Ciclos completos: ${i.cycleCount}`);
	lines.push(`- Stripe/Meta/behavioral conectado: ${i.hasCrossSourceSignal ? "sim" : "não"}`);
	if (i.nextMilestoneLabel) {
		lines.push(
			`- Próximo marco: ${i.nextMilestoneLabel} em ${i.nextMilestoneMonths ?? 0} meses`,
		);
		lines.push(`- Desbloqueio concreto a citar:`);
		if (i.nextMilestoneLabel === "M3") {
			lines.push(`  · Atribuição de receita real via Stripe + behavioral (sai de "estimativa de plano" pra "captura medida")`);
		} else if (i.nextMilestoneLabel === "M6") {
			lines.push(`  · Comparativo vs. categoria. Buyer vê onde está acima/abaixo dos pares`);
		} else {
			lines.push(`  · Predição de regressões antes de afetarem receita. Manutenção preventiva, não reativa`);
		}
	}
	lines.push("");
	lines.push("Escreva o parágrafo agora.");
	return { system, user: lines.join("\n") };
}

export async function generateValuePreviewNarrative(
	prisma: PrismaClient,
	ctx: GenerateContext,
	preview: ValuePreviewOutput,
	organizationId: string | null,
): Promise<LlmTextResult> {
	const inputs = await gatherInputs(prisma, ctx, preview);
	const { system, user } = buildPrompt(inputs);
	return callForText({
		model: "haiku_4_5",
		systemPrompt: system,
		userPrompt: user,
		maxTokens: 200,
		temperature: 0.5,
		purpose: "strategy_plan.value_preview_narrative",
		organizationId,
		environmentId: ctx.environmentId,
		fallbackText: fallback(inputs),
	});
}
