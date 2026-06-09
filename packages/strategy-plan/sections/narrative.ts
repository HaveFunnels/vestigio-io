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
import { monthLabel } from "../i18n";

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
	// T8 — additional inputs so the LLM can write a thesis-shaped
	// narrative instead of a stats blurb. Without these the narrative
	// could only describe what changed; now it can name the dominant
	// pattern, quantify what's at stake, and point at a decision.
	exposureTotal: number;
	exposureFindingCount: number;
	dominantPack: string | null;
	dominantPackShare: number; // 0..1
	dominantSurface: string | null;
	dominantSurfaceShare: number; // 0..1
	topOpenFindings: Array<{ title: string; impactMid: number; surface: string | null }>;
}

async function gatherInputs(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<NarrativeInputs> {
	const [resolved, newCritical, chronic, regression, openLoss] = await Promise.all([
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
		// T8 — open loss findings to derive exposure, dominant pack and
		// dominant surface so the narrative can name the pattern.
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

	const capturedTotal = resolved.reduce((a, r) => a + r.impactMidpoint, 0);

	// T8 — exposure totals + dominant pack/surface.
	const exposureTotal = Math.round(openLoss.reduce((a, r) => a + r.impactMidpoint, 0));
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
			? (sortedPacks[0][1] / openLoss.length)
			: 0;
	const dominantSurface = sortedSurfaces[0]?.[0] ?? null;
	const dominantSurfaceShare =
		dominantSurface && openLoss.length > 0
			? (sortedSurfaces[0][1] / openLoss.length)
			: 0;
	const topOpenFindings = openLoss.slice(0, 4).map((f) => ({
		title:
			(ctx.translations?.inference_titles?.[f.inferenceKey]
				?? f.inferenceKey.replace(/_/g, " ")),
		impactMid: Math.round(f.impactMidpoint),
		surface: f.surface,
	}));

	return {
		resolvedCount: resolved.length,
		resolvedCapturedTotal: Math.round(capturedTotal),
		resolvedSampleTitles: resolved
			.slice(0, 3)
			.map((r) =>
				`${ctx.translations?.inference_titles?.[r.inferenceKey] ?? r.inferenceKey.replace(/_/g, " ")} em ${r.surface}`,
			),
		newCriticalCount: newCritical.length,
		newCriticalSamples: newCritical
			.slice(0, 3)
			.map((r) =>
				`${ctx.translations?.inference_titles?.[r.inferenceKey] ?? r.inferenceKey.replace(/_/g, " ")} em ${r.surface}`,
			),
		chronicCount: chronic,
		regressionCount: regression,
		monthLabelPt: monthLabel(ctx.month, ctx.locale),
		envDomain: ctx.envDomain,
		exposureTotal,
		exposureFindingCount: openLoss.length,
		dominantPack,
		dominantPackShare,
		dominantSurface,
		dominantSurfaceShare,
		topOpenFindings,
	};
}

function fallbackNarrative(i: NarrativeInputs): string {
	// Deterministic fallback when Sonnet is unavailable (cost cap, API
	// error). T8 — emit as 4 paragraphs that mirror the LLM prompt
	// structure (mudança, padrão, jogo, decisão) so the page layout
	// stays consistent and the reader never sees a one-liner.
	const paras: string[] = [];

	// Para 1 — mudança do mês
	if (i.resolvedCount > 0) {
		paras.push(
			`Em ${i.monthLabelPt} você resolveu **${i.resolvedCount} ${i.resolvedCount === 1 ? "problema" : "problemas"}**, recuperando **R$ ${i.resolvedCapturedTotal.toLocaleString("pt-BR")}** em receita estimada.`,
		);
	} else {
		paras.push(
			`Em ${i.monthLabelPt} nada foi marcado como resolvido ainda. Vestigio continuou rodando análises e seguiu detectando ${i.exposureFindingCount > 0 ? `**${i.exposureFindingCount} ${i.exposureFindingCount === 1 ? "ponto" : "pontos"} de exposição**` : "pontos abertos"} no ${i.envDomain}.`,
		);
	}

	// Para 2 — padrão dominante
	if (i.dominantPack && i.dominantPackShare >= 0.3) {
		const pct = Math.round(i.dominantPackShare * 100);
		paras.push(
			`O padrão dominante este mês é **${i.dominantPack.replace(/_pack$/, "").replace(/_/g, " ")}** — concentra ${pct}% dos problemas abertos. Não é um conjunto aleatório de pontas; é um sintoma estrutural que reaparece em diferentes lugares do funil.`,
		);
	} else if (i.chronicCount > 0) {
		paras.push(
			`${i.chronicCount} ${i.chronicCount === 1 ? "problema reaparece" : "problemas reaparecem"} de forma recorrente — sinal de padrão estrutural, não sintoma isolado.`,
		);
	}

	// Para 3 — o que está em jogo
	if (i.exposureTotal > 0) {
		paras.push(
			`A exposição agregada está em **R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês** distribuída entre ${i.exposureFindingCount} ${i.exposureFindingCount === 1 ? "ponto" : "pontos"}. Vale ler esse número como "receita teoricamente em risco se nada mudar" — não é uma promessa de captura imediata, é o teto pra disputar.`,
		);
	}

	// Para 4 — decisão
	if (i.newCriticalCount > 0) {
		paras.push(
			`A decisão pra esse mês está clara: priorizar **${i.newCriticalCount} ${i.newCriticalCount === 1 ? "ponto crítico novo" : "pontos críticos novos"}** antes que ${i.newCriticalCount === 1 ? "afete" : "afetem"} receita medida. Os Próximos Passos abaixo ranqueiam por impacto financeiro calibrado.`,
		);
	} else if (i.regressionCount > 0) {
		paras.push(
			`A decisão pra esse mês: investigar **${i.regressionCount} ${i.regressionCount === 1 ? "regressão detectada" : "regressões detectadas"}** comparando com o último deploy. Os Próximos Passos abaixo já contemplam essa investigação na ordem certa.`,
		);
	} else {
		paras.push(
			`Comece pelos **Próximos Passos** logo abaixo — eles estão ranqueados por impacto financeiro calibrado, e o Passo 1 é o maior alavancador do mês.`,
		);
	}

	return paras.join("\n\n");
}

function buildPrompt(i: NarrativeInputs): { system: string; user: string } {
	const system = `Você é Vestigio escrevendo a seção "O que aconteceu em ${i.monthLabelPt}" de um Plano de Estratégia mensal para o operador de ${i.envDomain}. Essa é a tese do mês — a leitura estratégica que ancora o resto do plano.

Estrutura obrigatória — EXATAMENTE 4 parágrafos nessa ordem:

**Parágrafo 1 — A MUDANÇA do mês.**
Comece com o que mudou desde a última análise. Resolvido vs. novo, captado vs. detectado, sinais que apareceram. Se a primeira leitura ainda não tem comparativo, descreva o que Vestigio observou no ciclo recém-completado.

**Parágrafo 2 — O PADRÃO dominante.**
Identifique a pista comum entre os problemas abertos. Use o pack dominante, a surface mais concentrada, ou a categoria de causa que aparece mais vezes. Esse parágrafo precisa dar nome a um padrão, não enumerar lista.

**Parágrafo 3 — O QUE ESTÁ EM JOGO.**
Quantifique a exposição agregada. Use o R$/mês total + número de problemas que compõem a soma. Enquadre como "receita teoricamente em risco se nada mudar" — não como promessa de captura.

**Parágrafo 4 — A DECISÃO.**
Aponte para a aposta principal do mês. Cite o tema/Surface central (não cite Passo 1 ainda — esse parágrafo motiva a leitura dos Próximos Passos sem se sobrepor a eles).

Regras estritas:
1. Português brasileiro, voz de analista sênior — claro, restrito, sem hype. Voz ativa, primeira pessoa do plural ("observamos", "detectamos") quando precisar atribuir. Pode usar "Vestigio" como sujeito.
2. Marcação permitida: **negrito**, *itálico*, \`código inline\`, parágrafos separados por linha em branco. NADA de listas, cabeçalhos, HTML.
3. Toda afirmação numérica precisa vir dos dados abaixo. Não invente percentuais.
4. Total entre 180 e 240 palavras. Cada parágrafo entre 35 e 70 palavras. Mais curto é melhor que enchimento.
5. PROIBIDO mencionar "o engine", "a análise revelou", "foi capturado pelo sistema" (passivas). PROIBIDO citar identificadores técnicos (snake_case, "compound_*", "priorityScore", "decisionKey"). PROIBIDO clichês de relatório ("é importante notar", "vale destacar", "é fundamental").`;

	const data: string[] = [];
	data.push(`Dados do mês ${i.monthLabelPt} para ${i.envDomain}:`);
	data.push("");
	data.push(`# Mudança do mês`);
	data.push(`- Problemas resolvidos: ${i.resolvedCount}`);
	if (i.resolvedCount > 0) {
		data.push(`- Valor recuperado: R$ ${i.resolvedCapturedTotal.toLocaleString("pt-BR")}`);
		data.push(`- Exemplos de resolvidos:`);
		i.resolvedSampleTitles.forEach((t) => data.push(`  · ${t}`));
	}
	data.push(`- Problemas críticos novos: ${i.newCriticalCount}`);
	if (i.newCriticalCount > 0) {
		data.push(`- Exemplos críticos novos:`);
		i.newCriticalSamples.forEach((t) => data.push(`  · ${t}`));
	}
	data.push(`- Regressões detectadas: ${i.regressionCount}`);
	data.push("");
	data.push(`# Padrão dominante`);
	if (i.dominantPack) {
		const pct = Math.round(i.dominantPackShare * 100);
		data.push(`- Pack mais concentrado: ${i.dominantPack.replace(/_pack$/, "").replace(/_/g, " ")} (${pct}% dos problemas abertos)`);
	}
	if (i.dominantSurface) {
		const pct = Math.round(i.dominantSurfaceShare * 100);
		data.push(`- Surface mais concentrada: ${i.dominantSurface} (${pct}% dos problemas abertos)`);
	}
	data.push(`- Problemas recorrentes (3+ ciclos): ${i.chronicCount}`);
	data.push("");
	data.push(`# O que está em jogo`);
	data.push(`- Exposição agregada: R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês`);
	data.push(`- Total de problemas que compõem essa exposição: ${i.exposureFindingCount}`);
	if (i.topOpenFindings.length > 0) {
		data.push(`- Maiores buracos individuais:`);
		i.topOpenFindings.forEach((f) => {
			const where = f.surface ? ` em ${f.surface}` : "";
			data.push(`  · ${f.title}${where} — R$ ${f.impactMid.toLocaleString("pt-BR")}/mês`);
		});
	}
	data.push("");
	data.push(`Escreva a narrativa agora — exatamente 4 parágrafos na ordem definida.`);

	return { system, user: data.join("\n") };
}

export async function generateNarrativeWhatHappened(
	prisma: PrismaClient,
	ctx: GenerateContext,
	organizationId: string | null,
): Promise<LlmTextResult> {
	const inputs = await gatherInputs(prisma, ctx);

	// T8 — only skip the LLM when the env truly has nothing to talk about
	// (no resolved, no criticals, no chronic, no regression, AND no open
	// exposure). The previous guard skipped the LLM whenever resolved
	// activity was zero, which silenced the narrative for every fresh
	// env on its first plan — exactly the audience that needs the
	// thesis most.
	const empty =
		inputs.resolvedCount === 0 &&
		inputs.newCriticalCount === 0 &&
		inputs.chronicCount === 0 &&
		inputs.regressionCount === 0 &&
		inputs.exposureFindingCount === 0;
	if (empty) {
		return {
			text: `Em ${inputs.monthLabelPt} não houve mudanças materiais no ${inputs.envDomain}. Vestigio continua rodando análises contínuas e te avisamos assim que algo digno de revisão aparecer.`,
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
		maxTokens: 900,
		temperature: 0.45,
		purpose: "strategy_plan.narrative_what_happened",
		organizationId,
		environmentId: ctx.environmentId,
		fallbackText: fallbackNarrative(inputs),
	});
}
