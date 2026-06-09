// ──────────────────────────────────────────────
// E1 — Monthly thesis generator (single Haiku sentence)
//
// One sentence at the top of the plan that dictates the reading angle
// for everything below. Replaces "we found N items" enumeration mindset
// with "this month, the problem is X" argument mindset.
//
// Authored voice: signs as Vestigio, first-person plural. The UI
// renders this as a pull-quote with a small "— Vestigio" attribution
// underneath. Without authorial attribution it reads as system output,
// not analysis.
//
// Cost: ~$0.0005 per generation. Tiny — fires alongside the narrative
// so it stays internally consistent with the longer body.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";
import { callForText, type LlmTextResult } from "../llm-helpers";
import { monthLabel } from "../i18n";

interface ThesisInputs {
	monthLabelPt: string;
	envDomain: string;
	resolvedCount: number;
	resolvedCapturedTotal: number;
	exposureTotal: number;
	exposureFindingCount: number;
	dominantPack: string | null;
	dominantPackShare: number;
	dominantSurface: string | null;
	topFindingTitle: string | null;
	topFindingImpact: number;
	newCriticalCount: number;
	regressionCount: number;
	chronicCount: number;
}

async function gatherInputs(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<ThesisInputs> {
	// Reuse the same input bundle shape as narrative.ts so the thesis
	// and the body argue from identical data; otherwise they can
	// disagree and the customer notices the inconsistency.
	const [resolved, newCritical, chronic, regression, openLoss] = await Promise.all([
		prisma.finding.aggregate({
			where: {
				environmentId: ctx.environmentId,
				status: "resolved",
				statusChangedAt: { gte: ctx.monthStart, lt: ctx.monthEnd },
			},
			_sum: { impactMidpoint: true },
			_count: { _all: true },
		}),
		prisma.finding.count({
			where: {
				environmentId: ctx.environmentId,
				impactMidpoint: { gte: 5000 },
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created"] },
				statusChangedAt: { gte: ctx.monthStart, lt: ctx.monthEnd },
			},
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
		prisma.finding.findMany({
			where: {
				environmentId: ctx.environmentId,
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: ctx.monthEnd },
			},
			select: {
				inferenceKey: true,
				pack: true,
				surface: true,
				impactMidpoint: true,
			},
			orderBy: { impactMidpoint: "desc" },
		}),
	]);

	const packCounts: Record<string, number> = {};
	const surfaceCounts: Record<string, number> = {};
	for (const f of openLoss) {
		packCounts[f.pack] = (packCounts[f.pack] ?? 0) + 1;
		if (f.surface) surfaceCounts[f.surface] = (surfaceCounts[f.surface] ?? 0) + 1;
	}
	const sortedPacks = Object.entries(packCounts).sort((a, b) => b[1] - a[1]);
	const sortedSurfaces = Object.entries(surfaceCounts).sort((a, b) => b[1] - a[1]);
	const dominantPack = sortedPacks[0]?.[0] ?? null;
	const dominantPackShare =
		dominantPack && openLoss.length > 0
			? sortedPacks[0][1] / openLoss.length
			: 0;
	const dominantSurface = sortedSurfaces[0]?.[0] ?? null;
	const top = openLoss[0];
	const topFindingTitle = top
		? (ctx.translations?.inference_titles?.[top.inferenceKey]
			?? top.inferenceKey.replace(/_/g, " "))
		: null;

	return {
		monthLabelPt: monthLabel(ctx.month, ctx.locale),
		envDomain: ctx.envDomain,
		resolvedCount: resolved._count?._all ?? 0,
		resolvedCapturedTotal: Math.round(resolved._sum.impactMidpoint ?? 0),
		exposureTotal: Math.round(openLoss.reduce((a, r) => a + r.impactMidpoint, 0)),
		exposureFindingCount: openLoss.length,
		dominantPack,
		dominantPackShare,
		dominantSurface,
		topFindingTitle,
		topFindingImpact: top ? Math.round(top.impactMidpoint) : 0,
		newCriticalCount: newCritical,
		regressionCount: regression,
		chronicCount: chronic,
	};
}

// Deterministic fallback — used when LLM call fails AND as the source
// of truth for first-month envs where Haiku has nothing nuanced to add.
function fallbackThesis(i: ThesisInputs): string {
	if (i.exposureFindingCount === 0 && i.resolvedCount === 0) {
		return `Em ${i.monthLabelPt}, ${i.envDomain} ainda está em descoberta — sem padrão dominante o suficiente pra fechar uma tese deste mês.`;
	}

	// Pattern A: dominant pack is concentrated enough to name as the thesis.
	if (i.dominantPack && i.dominantPackShare >= 0.4) {
		const packReadable = i.dominantPack
			.replace(/_pack$/, "")
			.replace(/_/g, " ");
		return `Este mês, o gargalo de ${i.envDomain} é **${packReadable}** — concentra ${Math.round(i.dominantPackShare * 100)}% dos R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês em risco aberto.`;
	}

	// Pattern B: regressions dominate the news.
	if (i.regressionCount >= 2) {
		return `Este mês, ${i.envDomain} regrediu em **${i.regressionCount} pontos** — investigar deploy recente antes que receita medida caia.`;
	}

	// Pattern C: large single hole.
	if (i.topFindingImpact >= 5000 && i.topFindingTitle) {
		return `Este mês, o maior buraco aberto em ${i.envDomain} é **${i.topFindingTitle}** — sozinho carrega R$ ${i.topFindingImpact.toLocaleString("pt-BR")}/mês de exposição estimada.`;
	}

	// Pattern D: chronic pattern dominates.
	if (i.chronicCount >= 5) {
		return `Este mês, ${i.envDomain} mostra padrão estrutural: **${i.chronicCount} pontos recorrem** há 3+ ciclos — sintoma de causa raiz, não de erro isolado.`;
	}

	// Generic fallback when no shape dominates.
	return `Em ${i.monthLabelPt}, ${i.envDomain} acumulou **R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês** em exposição aberta distribuída entre ${i.exposureFindingCount} pontos — sem concentração suficiente pra apostar em um único movimento.`;
}

function buildPrompt(i: ThesisInputs): { system: string; user: string } {
	const system = `Você é Vestigio. Escreva a TESE deste mês para o operador de ${i.envDomain} — uma única frase que dita o ângulo de leitura do Plano de Estratégia inteiro.

Regras estritas:
1. UMA frase. Português brasileiro. 18-32 palavras. Mais curta é melhor.
2. Estrutura: comece com "Este mês," ou "Em ${i.monthLabelPt}," e termine com uma vírgula seguida de uma quebra de raciocínio ("— sintoma de…", "— sinal de…", "— porque…").
3. Use **negrito** UMA vez na frase, no termo central da tese.
4. Voz ativa, primeira pessoa do plural quando necessário ("observamos"). Pode usar "Vestigio" como sujeito.
5. PROIBIDO: "o engine", "a análise revelou", "foi capturado", "compound_*", snake_case, "priorityScore", "decisionKey".
6. PROIBIDO clichês de relatório ("vale destacar", "é importante notar").
7. A tese precisa ser uma APOSTA, não uma observação. "O gargalo é X" > "encontramos N problemas".`;

	const lines: string[] = [];
	lines.push(`Dados disponíveis (use só os que sustentam a tese — não cite todos):`);
	lines.push(`- Resolvidos no mês: ${i.resolvedCount} (R$ ${i.resolvedCapturedTotal.toLocaleString("pt-BR")} recuperado)`);
	lines.push(`- Exposição agregada em aberto: R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês em ${i.exposureFindingCount} pontos`);
	if (i.dominantPack) {
		lines.push(`- Pack dominante: ${i.dominantPack.replace(/_pack$/, "").replace(/_/g, " ")} (${Math.round(i.dominantPackShare * 100)}% dos pontos abertos)`);
	}
	if (i.dominantSurface) lines.push(`- Surface mais concentrada: ${i.dominantSurface}`);
	if (i.topFindingTitle) {
		lines.push(`- Maior buraco individual: ${i.topFindingTitle} (R$ ${i.topFindingImpact.toLocaleString("pt-BR")}/mês)`);
	}
	lines.push(`- Críticos novos este mês: ${i.newCriticalCount}`);
	lines.push(`- Regressões detectadas: ${i.regressionCount}`);
	lines.push(`- Problemas recorrentes (3+ ciclos): ${i.chronicCount}`);
	lines.push("");
	lines.push(`Escreva agora a tese — UMA frase.`);
	return { system, user: lines.join("\n") };
}

export async function generateMonthlyThesis(
	prisma: PrismaClient,
	ctx: GenerateContext,
	organizationId: string | null,
): Promise<LlmTextResult> {
	const inputs = await gatherInputs(prisma, ctx);
	const { system, user } = buildPrompt(inputs);
	return callForText({
		model: "haiku_4_5",
		systemPrompt: system,
		userPrompt: user,
		maxTokens: 120,
		temperature: 0.4,
		purpose: "strategy_plan.monthly_thesis",
		organizationId,
		environmentId: ctx.environmentId,
		fallbackText: fallbackThesis(inputs),
	});
}
