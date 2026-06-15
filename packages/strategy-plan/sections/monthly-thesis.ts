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
import { resolveInferenceTitle } from "../title-resolver";

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
		? (resolveInferenceTitle(top.inferenceKey, ctx.translations)
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
// All branches follow the THESIS template: name an axis with aggregated
// R$, then a decision direction. No em-dashes anywhere (the user banned
// them as an LLM tic). No single-finding restatements (that's a finding,
// not a thesis).
/** Customer-facing humanize for surfaces inside the thesis line.
    Matches the narrative section's helper but uses a slot-friendly
    form ("na página inicial", "no checkout") so it reads as natural
    Portuguese instead of route literal "`/`". */
function humanizeSurfaceThesis(surface: string): string {
	const t = surface.trim();
	if (t === "/") return "na página inicial";
	if (t === "/checkout") return "no checkout";
	if (t === "/pricing") return "na página de preços";
	if (t.includes(",")) return t.split(",").map((s) => humanizeSurfaceThesis(s.trim())).join(" e ");
	return `em ${t}`;
}

function fallbackThesis(i: ThesisInputs): string {
	if (i.exposureFindingCount === 0 && i.resolvedCount === 0) {
		return `Vestigio terminou o primeiro ciclo em ${i.envDomain} sem padrão concreto suficiente pra fechar uma tese. O próximo plano monta a tese.`;
	}

	// Reta-final vocab:
	//   - "exposição aberta" → "perda potencial aberta" (psychology lens)
	//   - "surface" → "página" / "esse ponto"
	//   - "/" literal → "página inicial"
	//   - "eixo" — kept; concrete enough in context, swaps to "tema" in
	//     fallback variants for variety

	// Pattern A — dominant surface IS the axis. Most informative shape on
	// fresh envs because it names WHERE to look, not WHAT was found.
	if (i.dominantSurface && i.exposureFindingCount >= 3) {
		const where = humanizeSurfaceThesis(i.dominantSurface);
		return `Vestigio mapeou **R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês** de perda potencial aberta, com peso concentrado ${where}. O foco do mês é o que acontece nessa página. Comece pelo Passo 1.`;
	}

	// Pattern B — regressions are concrete and need investigation. Frame
	// as the axis "what changed since last cycle".
	if (i.regressionCount >= 2) {
		return `Identificamos **${i.regressionCount} regressões** desde o último ciclo. O foco do mês é descobrir o que mudou no deploy recente antes que receita medida caia. Comece pelo Passo 1.`;
	}

	// Pattern C — chronic pattern is the axis. Framed as decisions
	// deferred, not as abstract structural pattern.
	if (i.chronicCount >= 5) {
		return `Vestigio mapeou **${i.chronicCount} pontos** voltando há 3 ciclos ou mais. O foco do mês não é volume novo, é o que ficou para trás. Resolva pelos Próximos Passos primeiro.`;
	}

	// Pattern D — fallback when no shape dominates. Stay concrete using
	// total R$ + finding count.
	return `Vestigio mapeou **R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês** de perda potencial aberta em ${i.envDomain}, distribuída em ${i.exposureFindingCount} pontos. O foco do mês é começar a fechar os de maior impacto financeiro. Comece pelo Passo 1.`;
}

function buildPrompt(i: ThesisInputs): { system: string; user: string } {
	const system = `Você é Vestigio. Escreva a TESE deste mês para o operador de ${i.envDomain}.

Uma TESE é diferente de um finding:
- TESE: nomeia um FOCO (uma área, página, ou momento do funil) onde a maior parte do problema vive este mês. Quantifica esse foco de forma AGREGADA (R$ somado sobre múltiplos pontos). Dá direção de leitura pro plano inteiro.
- FINDING: descreve UM ponto observado. Vai na lista de Próximos Passos, não na tese.

Vocabulário CUSTOMER-FACING obrigatório:
- "vazamento" / "perda potencial" / "receita em risco", NÃO "exposição"
- "página inicial" / "checkout" / "página de preços", NÃO "\`/\`" literal nem "surface"
- "foco do mês" / "tema do mês", NÃO "eixo" (engenharia mecânica)
- "movimento principal" / "alavanca central", NÃO "aposta" (Vestigio AFIRMA com dado, não aposta)

**Estrutura obrigatória — exatamente 2 ou 3 frases:**

Frase 1 (10-18 palavras): nomeia o FOCO e quantifica.
Padrão: "Vestigio [verbo analítico] [R$ agregado] concentrado em [foco nomeado]"
Verbos válidos no início: **detectou, encontrou, mapeou, observou, identificou, rastreou**.
Variante: "Encontramos / Detectamos / Identificamos" (primeira pessoa do plural = Vestigio).
Foco pode ser: página específica ("no checkout", "na página de preços"), momento do funil ("entre ver preço e pagar", "no topo do funil"), categoria de problema com páginas atreladas ("copy do checkout e da página de preços").

Frase 2 (8-16 palavras): nomeia o MOVIMENTO PRINCIPAL do mês. Padrão: "O movimento principal é [decisão estratégica]" ou "O foco é [escopo]".

Frase 3 (opcional, 5-10 palavras): direciona a leitura. Ex.: "Comece pelos Próximos Passos 1 e 4." / "O Passo 1 abre essa frente."

Total: 25-44 palavras. Mais curto sempre vence.

**Os 3 ingredientes obrigatórios (qualquer um pode aparecer em qualquer frase):**
1. Um valor financeiro AGREGADO (R$ X.XXX/mês somado, não impacto de um único item).
2. Pelo menos UMA página específica em texto natural (página inicial, checkout, página de preços, página de signup). Sem usar "/" literal ou "\`/\`" como nome.
3. Uma direção/decisão imperativa pra leitura do resto do plano.

**Use negrito** UMA vez, no valor em R$ agregado.

**PROIBIDO:**
- A palavra "exposição" em qualquer lugar. Substitua por "vazamento" ou "perda potencial".
- A palavra "surface" em qualquer lugar. Substitua por "página".
- "\`/\`" literal como nome de página. Escreva "página inicial".
- "eixo". Substitua por "foco" ou "tema".
- "aposta" / "Vestigio aposta" / "Vestigio acredita" / "Vestigio estima". Vestigio AFIRMA com base em dado.
- TRAVESSÃO (—) em qualquer lugar do texto. Use ponto, vírgula, dois pontos, ou parênteses.
- "é sintoma de", "é sinal de", "é manifestação de", "indica que" (claims causais frágeis).
- "padrão dominante", "padrão estrutural", "desalinhamento de copy", "checkout fragmentado", "mensagens desconectadas" (nomes abstratos sem âncora).
- "concentra X%" sem âncora num R$.
- "o engine", "a análise revelou", "foi capturado" (passivas).
- "vale destacar", "é importante notar", "vale ler como" (clichês de relatório).
- "compound_*", snake_case, "priorityScore", "decisionKey".
- Frase única que descreve UM finding (isso é trabalho dos Próximos Passos).

**Exemplo BOM** (tese estratégica):
> Vestigio mapeou **R$ 17.500/mês** de perda potencial concentrada no checkout (redirecionamento de domínio mais ausência de contexto de preço). O movimento principal é o que acontece entre ver preço e pagar. Comece pelos Próximos Passos 1 e 4.

**Exemplo BOM** (variante por foco de funil):
> Identificamos **R$ 76.000/mês** vazando no topo do funil. Página inicial e página de preços. O foco do mês é refazer o que o comprador encontra antes de qualquer CTA. O Passo 1 abre essa frente.

**Exemplo RUIM** (finding restated, não tese):
> Vestigio detectou **R$ 8.750/mês** saindo no clique de pagar no checkout. Comprador é jogado pra outro domínio.

**Exemplo RUIM** (abstração + hedge):
> Este mês, o padrão dominante é o desalinhamento de copy, sintoma de um checkout fragmentado que dispersa compradores antes da conversão.`;

	const lines: string[] = [];
	lines.push(`Dados disponíveis (use só os que sustentam a tese. Não cite todos):`);
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
	lines.push(`Escreva agora a tese. UMA frase.`);
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
