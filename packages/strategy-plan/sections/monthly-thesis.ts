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
// All branches follow the same template:
//   "Vestigio [verbo de ação] [R$ específico] [comportamento/surface]. [Decisão]."
// Pattern-name abstractions are not allowed here — every branch must
// name a concrete number and a concrete surface.
function fallbackThesis(i: ThesisInputs): string {
	if (i.exposureFindingCount === 0 && i.resolvedCount === 0) {
		return `Vestigio terminou o primeiro ciclo em ${i.envDomain} sem padrão concreto suficiente pra fechar uma tese — o próximo plano monta a tese.`;
	}

	// Pattern A — biggest single hole leads. This is the version most likely
	// to fire on first-month envs (havefunnels et al). Always names a R$
	// + a surface + a decision.
	if (i.topFindingTitle && i.topFindingImpact >= 1000) {
		const where = (() => {
			// Try to use top finding's surface if it carries one (most do).
			// The current ThesisInputs shape doesn't include topFinding.surface
			// directly — derive it from the title format if needed. Fallback
			// keeps just the title.
			return `\`${i.dominantSurface ?? "/"}\``;
		})();
		return `Vestigio detectou **R$ ${i.topFindingImpact.toLocaleString("pt-BR")}/mês** saindo em ${where} — ${i.topFindingTitle.toLowerCase()}. Esse é o passo 1.`;
	}

	// Pattern B — regressions are concrete and need investigation.
	if (i.regressionCount >= 2) {
		return `Vestigio identificou **${i.regressionCount} regressões** desde o último ciclo — investigar deploy recente antes que receita medida caia. Esse é o passo 1.`;
	}

	// Pattern C — chronic pattern, framed as decision deferred (not as
	// "estrutural" abstract). Anchors on the dominant surface to stay concrete.
	if (i.chronicCount >= 5 && i.dominantSurface) {
		return `Vestigio mapeou **${i.chronicCount} pontos** voltando há 3+ ciclos em \`${i.dominantSurface}\` — não é volume novo, é decisão adiada. Resolva agora.`;
	}

	// Pattern D — exposure exists but no shape dominates. Stay concrete
	// using total R$ + surface count.
	return `Vestigio mapeou **R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês** em exposição aberta em ${i.envDomain} — distribuída em ${i.exposureFindingCount} pontos sem concentração única. Comece pelo Passo 1.`;
}

function buildPrompt(i: ThesisInputs): { system: string; user: string } {
	const system = `Você é Vestigio. Escreva a TESE deste mês para o operador de ${i.envDomain} — uma frase (ou no máximo duas) que assina um achado e aponta uma decisão.

Regras estritas:

**Estrutura obrigatória — 1 ou 2 frases:**

Frase 1 (8-16 palavras): começa com **"Vestigio [verbo de ação analítica] [observação concreta com R$ e surface]"**.
  Verbos permitidos como início: **detectou, encontrou, mapeou, observou, identificou, rastreou**.
  Forma alternativa: começar com "Encontramos / Detectamos / Identificamos" (primeira pessoa do plural = Vestigio).

Frase 2, opcional (6-12 palavras): aponta UMA decisão imperativa concreta. Ex.: "Resolva isso primeiro." / "Esse é o passo 1."

Total: 14-28 palavras. **Mais curto sempre vence.**

**O conteúdo precisa ter os 3 ingredientes:**
1. UM valor financeiro específico (R$ X.XXX/mês). Não "44% dos problemas", não "exposição agregada" — um número de dinheiro.
2. UM comportamento concreto observável (ex.: "saindo no clique de 'pagar'", "no formulário de checkout", "no botão 'continuar' do /pricing"). Não "desalinhamento de copy", não "fragmentação de checkout".
3. UMA surface específica do site (/, /pricing, /checkout, /signup, etc.). Sempre nomeie em \`código inline\`.

**PROIBIDO:**
- "aposta que", "acredita", "estima que" como sujeito de Vestigio — são hedges. Vestigio AFIRMA, não aposta.
- "é sintoma de", "é sinal de", "é manifestação de", "indica que" — claims causais frágeis que ninguém pode falsificar.
- "padrão dominante", "padrão estrutural", "sintoma estrutural", "desalinhamento de copy", "checkout fragmentado", "mensagens desconectadas" — nomes de padrão abstratos sem instância concreta atrelada.
- "concentra X%" sem âncora num R$. Porcentagem só é evidência se aponta pra dinheiro.
- "o engine", "a análise revelou", "foi capturado" (passivas).
- "vale destacar", "é importante notar", "vale ler como" (clichês de relatório).
- "compound_*", snake_case, "priorityScore", "decisionKey".

**Use negrito** UMA vez, no valor em R$ ou no surface central.

**Exemplo BOM** (do tom que você deve produzir):
> Vestigio detectou **R$ 8.750/mês** saindo no clique de pagar em \`/checkout\` — clicar joga o comprador pra outro domínio. Resolva isso primeiro.

**Exemplo RUIM** (não imite):
> Este mês, o padrão dominante é o desalinhamento de copy — sintoma de um checkout fragmentado que dispersa compradores antes da conversão.`;

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
