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
import { voiceRulesFor } from "../voice-rules";
import type { GenerateContext, ValuePreviewOutput } from "../types";
import { callForText, type LlmTextResult } from "../llm-helpers";

interface PreviewInputs {
	envDomain: string;
	envAgeMonths: number;
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
		// HONESTY RULE (EXAME P20): only unlocks that ship today. No
		// "benchmark vs categoria" (no service), no Stripe named to a
		// PIX store, no recommender.
		const unlock =
			i.nextMilestoneLabel === "M3"
				? "a comparação mês a mês fica real: o plano mostra o que melhorou e o que voltou a quebrar desde o anterior"
				: i.nextMilestoneLabel === "M6"
					? "seis meses de histórico mostram a tendência de cada página do seu funil, não só a foto do mês"
					: "um ano de histórico abre a comparação ano a ano e a sazonalidade real do seu funil";
		return `Você está há **${i.envAgeMonths} ${i.envAgeMonths === 1 ? "mês" : "meses"}** com Vestigio. Próximo marco: **${i.nextMilestoneLabel}** ${monthsTxt}. A partir daí, ${unlock}.`;
	}
	return `Você está há **${i.envAgeMonths} ${i.envAgeMonths === 1 ? "mês" : "meses"}** com Vestigio, com histórico completo: comparação ano a ano e sazonalidade real do seu funil.`;
}

function buildPrompt(i: PreviewInputs, locale: string): { system: string; user: string } {
	const rules = voiceRulesFor(locale);
	const system = `Você escreve um parágrafo curto (máximo 2 frases, ~50 palavras) para a seção "O que você ganha continuando" de um Plano de Estratégia.

IDIOMA DA RESPOSTA (obrigatório): escreva em ${rules.language_name}.

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
	// Deliberately NOT passing cycleCount: cycles run many times a day,
	// so the raw count ("2121 ciclos") reads as a vanity number and the
	// model was quoting it as if it backed capability claims (EXAME P20).
	lines.push(`- Integração de dados conectada: ${i.hasCrossSourceSignal ? "sim" : "não"}`);
	if (i.nextMilestoneLabel) {
		lines.push(
			`- Próximo marco: ${i.nextMilestoneLabel} em ${i.nextMilestoneMonths ?? 0} meses`,
		);
		lines.push(`- Desbloqueio concreto a citar (NÃO invente outros):`);
		if (i.nextMilestoneLabel === "M3") {
			lines.push(`  · Comparação real mês a mês: o plano passa a mostrar o que melhorou e o que voltou a quebrar desde o anterior`);
		} else if (i.nextMilestoneLabel === "M6") {
			lines.push(`  · Tendência de 6 meses por página do funil, não só a foto do mês`);
		} else {
			lines.push(`  · Comparação ano a ano e sazonalidade real do funil`);
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
	const { system, user } = buildPrompt(inputs, ctx.locale);
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
