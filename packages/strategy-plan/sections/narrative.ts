// ──────────────────────────────────────────────
// "O que aconteceu em [mês]" narrative generator — Sonnet 4.6
//
// The single most narrative-quality-dependent section of the plan.
// Sonnet because the prompt asks for: cited claims, paragraph
// rhythm, restraint vs hype, plain-Portuguese clarity. Haiku
// produced more generic text in eval iterations.
//
// Prompt design:
//   - Constrained output: 2-3 paragraphs, markdown-ish only (**bold**,
//     *italic*, backticks). The Plan UI renders exactly those four
//     constructs and nothing else.
//   - Grounding: every numeric claim must point at evidence we
//     provide in the prompt (resolved counts, captured totals,
//     critical introductions, chronic + regression flags).
//   - Tone: like a senior PM writing to the operator, NOT
//     marketing copy. "O time tá fechando padrões, não só sintomas"
//     vs "Vestigio identifies opportunities".
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";
import { callForText, type LlmTextResult } from "../llm-helpers";

interface NarrativeInputs {
	resolvedCount: number;
	resolvedCapturedTotal: number;
	resolvedSampleTitles: string[];
	newCriticalCount: number;
	newCriticalSamples: string[];
	chronicCount: number;
	regressionCount: number;
	monthLabelPt: string;
	envDomain: string;
}

const MONTH_NAMES_PT_BR = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthLabel(ymd: string): string {
	const [, mm] = ymd.split("-");
	return MONTH_NAMES_PT_BR[parseInt(mm, 10) - 1] ?? ymd;
}

async function gatherInputs(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<NarrativeInputs> {
	const [resolved, newCritical, chronic, regression] = await Promise.all([
		prisma.finding.findMany({
			where: {
				environmentId: ctx.environmentId,
				status: "resolved",
				statusChangedAt: { gte: ctx.monthStart, lt: ctx.monthEnd },
			},
			select: { inferenceKey: true, surface: true, impactMidpoint: true },
			orderBy: { impactMidpoint: "desc" },
			take: 6,
		}),
		prisma.finding.findMany({
			where: {
				environmentId: ctx.environmentId,
				severity: "critical",
				status: { in: ["created"] },
				statusChangedAt: { gte: ctx.monthStart, lt: ctx.monthEnd },
			},
			select: { inferenceKey: true, surface: true, impactMidpoint: true },
			orderBy: { impactMidpoint: "desc" },
			take: 4,
		}),
		prisma.finding.count({
			where: {
				environmentId: ctx.environmentId,
				cyclesSeen: { gte: 3 },
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: ctx.monthEnd },
			},
		}),
		prisma.finding.count({
			where: {
				environmentId: ctx.environmentId,
				changeClass: "regression",
				statusChangedAt: { gte: ctx.monthStart, lt: ctx.monthEnd },
			},
		}),
	]);

	const capturedTotal = resolved.reduce((a, r) => a + r.impactMidpoint, 0);

	return {
		resolvedCount: resolved.length,
		resolvedCapturedTotal: Math.round(capturedTotal),
		resolvedSampleTitles: resolved
			.slice(0, 3)
			.map((r) => `${r.inferenceKey.replace(/_/g, " ")} em ${r.surface}`),
		newCriticalCount: newCritical.length,
		newCriticalSamples: newCritical
			.slice(0, 3)
			.map((r) => `${r.inferenceKey.replace(/_/g, " ")} em ${r.surface}`),
		chronicCount: chronic,
		regressionCount: regression,
		monthLabelPt: monthLabel(ctx.month),
		envDomain: ctx.envDomain,
	};
}

function fallbackNarrative(i: NarrativeInputs): string {
	// Deterministic fallback when Sonnet is unavailable (cost cap, API
	// error). Reads like a brief summary, never empty/error-shaped.
	const parts: string[] = [];
	if (i.resolvedCount > 0) {
		parts.push(
			`Em ${i.monthLabelPt} você resolveu **${i.resolvedCount} findings** totalizando **R$ ${i.resolvedCapturedTotal.toLocaleString("pt-BR")}** em valor capturado.`,
		);
	} else {
		parts.push(`Em ${i.monthLabelPt} nenhum finding foi marcado como resolvido.`);
	}
	if (i.newCriticalCount > 0) {
		parts.push(
			`Esse ciclo introduziu **${i.newCriticalCount} ${i.newCriticalCount === 1 ? "finding crítico novo" : "findings críticos novos"}** que vale atacar primeiro.`,
		);
	}
	if (i.chronicCount > 0) {
		parts.push(
			`${i.chronicCount} ${i.chronicCount === 1 ? "finding aparece" : "findings aparecem"} de forma recorrente — sinal de padrão estrutural, não sintoma isolado.`,
		);
	}
	if (i.regressionCount > 0) {
		parts.push(
			`${i.regressionCount} ${i.regressionCount === 1 ? "regressão foi detectada" : "regressões foram detectadas"} esse mês — comparar com o último deploy ajuda a localizar a causa.`,
		);
	}
	return parts.join(" ");
}

function buildPrompt(i: NarrativeInputs): { system: string; user: string } {
	const system = `Você é um analista sênior escrevendo a seção "O que aconteceu em ${i.monthLabelPt}" de um Plano de Estratégia mensal para o operador de ${i.envDomain}.

Regras estritas:
1. Escreva 2 a 3 parágrafos em português brasileiro, tom de PM sênior — claro, restrito, sem hype.
2. Use apenas estes elementos de formatação: **negrito**, *itálico*, \`código inline\`, e quebra de parágrafo via linha em branco.
3. NÃO use listas, NÃO use cabeçalhos, NÃO use HTML.
4. Toda afirmação numérica precisa vir dos dados fornecidos abaixo. Não invente percentuais ou métricas.
5. Comece com o que foi RESOLVIDO esse mês (vitória) antes de levantar o que foi introduzido (problema). Evite mensagens defensivas ou alarmistas.
6. Se o mês teve regressões ou findings críticos novos, mencione com calma; sugira ação ("vale priorizar X antes de afetar revenue") mas não dramatize.
7. Máximo de ~140 palavras no total.`;

	const data: string[] = [];
	data.push(`Dados do mês ${i.monthLabelPt} para ${i.envDomain}:`);
	data.push(`- Findings resolvidos: ${i.resolvedCount}`);
	if (i.resolvedCount > 0) {
		data.push(`- Valor capturado total: R$ ${i.resolvedCapturedTotal.toLocaleString("pt-BR")}`);
		data.push(`- Exemplos de findings resolvidos:`);
		i.resolvedSampleTitles.forEach((t) => data.push(`  · ${t}`));
	}
	data.push(`- Findings críticos novos introduzidos esse mês: ${i.newCriticalCount}`);
	if (i.newCriticalCount > 0) {
		data.push(`- Exemplos:`);
		i.newCriticalSamples.forEach((t) => data.push(`  · ${t}`));
	}
	data.push(`- Findings crônicos abertos (3+ ciclos consecutivos): ${i.chronicCount}`);
	data.push(`- Regressões detectadas no mês: ${i.regressionCount}`);
	data.push("");
	data.push("Escreva a narrativa agora.");

	return { system, user: data.join("\n") };
}

export async function generateNarrativeWhatHappened(
	prisma: PrismaClient,
	ctx: GenerateContext,
	organizationId: string | null,
): Promise<LlmTextResult> {
	const inputs = await gatherInputs(prisma, ctx);

	// Skip the LLM call entirely when there's literally nothing to
	// describe — saves a token-burning prompt that would just say "no
	// activity this month."
	const empty =
		inputs.resolvedCount === 0 &&
		inputs.newCriticalCount === 0 &&
		inputs.chronicCount === 0 &&
		inputs.regressionCount === 0;
	if (empty) {
		return {
			text: `Em ${inputs.monthLabelPt} não houve mudanças materiais no ${inputs.envDomain}. Os audits continuam rodando e te avisamos assim que algo digno de revisão aparecer.`,
			costCents: 0,
			callsCount: 0,
			fallback: false,
		};
	}

	const { system, user } = buildPrompt(inputs);
	return callForText({
		model: "sonnet_4_6",
		systemPrompt: system,
		userPrompt: user,
		maxTokens: 600,
		temperature: 0.45,
		purpose: "strategy_plan.narrative_what_happened",
		organizationId,
		environmentId: ctx.environmentId,
		fallbackText: fallbackNarrative(inputs),
	});
}
