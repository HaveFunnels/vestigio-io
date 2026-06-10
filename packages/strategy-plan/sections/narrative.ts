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
import { resolveInferenceTitle } from "../title-resolver";

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
	/** Reta-final: number of DISTINCT (inferenceKey, surface) pairs
	    across openLoss. Replaces exposureFindingCount in customer-facing
	    counts so dup-key emissions don't inflate the "N vazamentos"
	    number. Used by both fallback narrative and the LLM prompt. */
	distinctExposurePoints: number;
	dominantPack: string | null;
	dominantPackShare: number; // 0..1
	dominantSurface: string | null;
	dominantSurfaceShare: number; // 0..1
	topOpenFindings: Array<{ title: string; impactMid: number; surface: string | null }>;
	/** Reta-final: is this the first plan for this env? Flips opening
	    from accusatory to onboarding. Read from GenerateContext. */
	isFirstPlan: boolean;
	/** Reta-final: top 1 positive finding (well-calibrated thing) used
	    to open the narrative with "what's holding up" before the diagnosis.
	    Null when no positive findings exist for the cycle. */
	positiveSample: { title: string; surface: string | null } | null;
}

async function gatherInputs(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<NarrativeInputs> {
	const [resolved, newCritical, chronic, regression, openLoss, positives] = await Promise.all([
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
		// Reta-final: top 1 positive finding to open the narrative
		// before the diagnosis. Top by impactMidpoint so the most
		// load-bearing strength leads — not the first row in DB order.
		prisma.finding.findMany({
			where: {
				environmentId: ctx.environmentId,
				polarity: "positive",
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: ctx.monthEnd },
			},
			select: { inferenceKey: true, surface: true, impactMidpoint: true },
			orderBy: { impactMidpoint: "desc" },
			take: 1,
		}),
	]);

	const capturedTotal = resolved.reduce((a, r) => a + r.impactMidpoint, 0);

	// Reta-final dedupe: the engine emits multiple Finding rows per real
	// inference (per cycle, per re-detection) and openLoss naturally
	// inflates the customer-facing count. Distinct (inferenceKey,
	// surface) pairs is the honest "how many discrete things are open".
	// Used in customer-facing copy; raw exposureFindingCount stays
	// available for internal LLM prompt context (so the model knows the
	// raw cardinality of evidence it's looking at).
	const distinctExposurePoints = new Set(
		openLoss.map((f) => `${f.inferenceKey}::${f.surface ?? ""}`),
	).size;

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
			resolveInferenceTitle(f.inferenceKey, ctx.translations)
			?? f.inferenceKey.replace(/_/g, " "),
		impactMid: Math.round(f.impactMidpoint),
		surface: f.surface,
	}));

	const positiveTop = positives[0];
	const positiveSample = positiveTop
		? {
			title:
				resolveInferenceTitle(positiveTop.inferenceKey, ctx.translations)
				?? positiveTop.inferenceKey.replace(/_/g, " "),
			surface: positiveTop.surface,
		}
		: null;

	return {
		resolvedCount: resolved.length,
		resolvedCapturedTotal: Math.round(capturedTotal),
		resolvedSampleTitles: resolved
			.slice(0, 3)
			.map((r) =>
				`${resolveInferenceTitle(r.inferenceKey, ctx.translations) ?? r.inferenceKey.replace(/_/g, " ")} em ${r.surface}`,
			),
		newCriticalCount: newCritical.length,
		newCriticalSamples: newCritical
			.slice(0, 3)
			.map((r) =>
				`${resolveInferenceTitle(r.inferenceKey, ctx.translations) ?? r.inferenceKey.replace(/_/g, " ")} em ${r.surface}`,
			),
		chronicCount: chronic,
		regressionCount: regression,
		monthLabelPt: monthLabel(ctx.month, ctx.locale),
		envDomain: ctx.envDomain,
		exposureTotal,
		exposureFindingCount: openLoss.length,
		distinctExposurePoints,
		dominantPack,
		dominantPackShare,
		dominantSurface,
		dominantSurfaceShare,
		topOpenFindings,
		isFirstPlan: ctx.isFirstPlan ?? false,
		positiveSample,
	};
}

/** Human-friendly pack name for customer-facing prose. Internal pack
    identifiers (copy_alignment, scale_readiness, etc.) read as jargon
    when surfaced raw. This is a closed list — new packs need an entry. */
function humanizePack(pack: string, locale: string): string {
	const k = pack.replace(/_pack$/, "");
	if (locale === "pt-BR") {
		const map: Record<string, string> = {
			copy_alignment: "consistência da mensagem",
			scale_readiness: "preparo para escala",
			trust: "sinais de confiança no checkout",
			revenue: "captura de receita",
			chargeback: "risco de chargeback",
			saas: "ciclo SaaS",
			behavioral: "comportamento do visitante",
		};
		return map[k] ?? k.replace(/_/g, " ");
	}
	return k.replace(/_/g, " ");
}

/** "/" reads as engineer-speak when surfaced to a customer. Map it (and
    other terse routes) to natural language. Unknown routes fall through
    to the literal value so we never lie about which page is meant. */
function humanizeSurfaceCustomerFacing(surface: string | null): string {
	if (!surface) return "esta página";
	const trimmed = surface.trim();
	if (trimmed === "/") return "página inicial";
	if (trimmed === "/checkout") return "checkout";
	if (trimmed === "/pricing") return "página de preços";
	if (trimmed.includes(",")) {
		return trimmed.split(",").map((s) => humanizeSurfaceCustomerFacing(s.trim())).join(" e ");
	}
	return trimmed;
}

function fallbackNarrative(i: NarrativeInputs): string {
	// Deterministic fallback when Sonnet is unavailable (cost cap, API
	// error). T8 — emit as 4 paragraphs that mirror the LLM prompt
	// structure (mudança, padrão, jogo, decisão) so the page layout
	// stays consistent and the reader never sees a one-liner.
	//
	// Reta-final updates:
	//   - First-plan tone (no accusatory "nada foi resolvido")
	//   - Positive opener (1 well-calibrated thing before diagnosis)
	//   - Dedupe counts (distinctExposurePoints not exposureFindingCount)
	//   - Vocab swap (vazamento not exposição; página not surface;
	//     consistência da mensagem not copy_alignment)
	//   - No "aposta" gambling metaphor (Vestigio claims data, not bets)
	const paras: string[] = [];

	// Optional positive opener — 1 sentence before the diagnosis. Skips
	// when no positive findings; never carries impact number (positives
	// preserve receita; surfacing a R$ would imply they capture).
	const positiveOpener = i.positiveSample
		? `Antes do diagnóstico: **${i.positiveSample.title}** está calibrado em ${humanizeSurfaceCustomerFacing(i.positiveSample.surface)} — esse ponto está segurando receita que poderia escapar. `
		: "";

	// Para 1 — mudança do mês
	if (i.resolvedCount > 0) {
		paras.push(
			`${positiveOpener}Em ${i.monthLabelPt} você resolveu **${i.resolvedCount} ${i.resolvedCount === 1 ? "problema" : "problemas"}**, recuperando **R$ ${i.resolvedCapturedTotal.toLocaleString("pt-BR")}** em receita estimada.`,
		);
	} else if (i.isFirstPlan) {
		// First-plan onboarding tone — no accusation. Customer just
		// activated; they couldn't have resolved anything yet.
		paras.push(
			`${positiveOpener}Esse é o seu primeiro plano. Vestigio acabou de mapear ${i.distinctExposurePoints > 0 ? `**${i.distinctExposurePoints} ${i.distinctExposurePoints === 1 ? "vazamento" : "vazamentos"}**` : "o estado atual"} em ${i.envDomain}.`,
		);
	} else {
		paras.push(
			`${positiveOpener}Em ${i.monthLabelPt}, nenhum problema foi marcado como resolvido. Vestigio seguiu detectando ${i.distinctExposurePoints > 0 ? `**${i.distinctExposurePoints} ${i.distinctExposurePoints === 1 ? "vazamento aberto" : "vazamentos abertos"}**` : "pontos abertos"} em ${i.envDomain}.`,
		);
	}

	// Para 2 — padrão dominante (vocab swap: padrão → tema; pontas →
	// casos isolados; sintoma estrutural → padrão que se repete)
	if (i.dominantPack && i.dominantPackShare >= 0.3) {
		const pct = Math.round(i.dominantPackShare * 100);
		paras.push(
			`O tema dominante este mês é **${humanizePack(i.dominantPack, "pt-BR")}**, concentrando ${pct}% dos vazamentos abertos. Não são casos isolados; é um padrão que reaparece em pontos diferentes do funil.`,
		);
	} else if (i.chronicCount > 0) {
		paras.push(
			`${i.chronicCount} ${i.chronicCount === 1 ? "problema reaparece" : "problemas reaparecem"} de forma recorrente, sinal de padrão estrutural, não falha pontual.`,
		);
	}

	// Para 3 — o que está em jogo (vocab swap: exposição agregada →
	// perda potencial total; teto pra disputar mantido pois é metáfora
	// concreta de luta/recuperação, não jargão)
	if (i.exposureTotal > 0) {
		paras.push(
			`A perda potencial total está em **R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês** distribuída entre ${i.distinctExposurePoints} ${i.distinctExposurePoints === 1 ? "vazamento" : "vazamentos"}. Vale ler esse número como receita teoricamente em risco se nada mudar, não como promessa de captura imediata. É o teto pra disputar.`,
		);
	}

	// Para 4 — decisão (vocab swap: aposta → movimento; ranqueados →
	// ordenados, leitura mais natural)
	if (i.newCriticalCount > 0) {
		paras.push(
			`A decisão pra esse mês: priorizar **${i.newCriticalCount} ${i.newCriticalCount === 1 ? "ponto crítico novo" : "pontos críticos novos"}** antes que ${i.newCriticalCount === 1 ? "afete" : "afetem"} receita medida. Os Próximos Passos abaixo estão ordenados por impacto financeiro calibrado.`,
		);
	} else if (i.regressionCount > 0) {
		paras.push(
			`A decisão pra esse mês: investigar **${i.regressionCount} ${i.regressionCount === 1 ? "regressão detectada" : "regressões detectadas"}** comparando com o último deploy. Os Próximos Passos abaixo já contemplam essa investigação na ordem certa.`,
		);
	} else {
		paras.push(
			`Comece pelos **Próximos Passos** logo abaixo. Eles estão ordenados por impacto financeiro, e o Passo 1 é o maior alavancador do mês.`,
		);
	}

	return paras.join("\n\n");
}

function buildPrompt(i: NarrativeInputs): { system: string; user: string } {
	const firstPlanFrame = i.isFirstPlan
		? `\n\nIMPORTANTE: esse é o PRIMEIRO PLANO desse env. Não acuse o cliente de "nada foi resolvido" — ele acabou de ativar. Use tom de onboarding ("Esse é o seu primeiro plano. Vestigio acabou de mapear...").`
		: "";
	const positiveOpenerHint = i.positiveSample
		? `\n\nABERTURA OBRIGATÓRIA: comece o Parágrafo 1 com 1 frase reconhecendo o que ESTÁ funcionando bem (use o ponto positivo listado nos dados como "${i.positiveSample.title}"${i.positiveSample.surface ? ` em ${i.positiveSample.surface}` : ""}). NÃO carregue R$ no positivo (não captura, segura). Em seguida emende com o diagnóstico do mês.`
		: "";
	const system = `Você é Vestigio escrevendo a seção "O que aconteceu em ${i.monthLabelPt}" de um Plano de Estratégia mensal para o operador de ${i.envDomain}. Essa é a tese do mês — a leitura estratégica que ancora o resto do plano.${firstPlanFrame}${positiveOpenerHint}

Estrutura obrigatória — EXATAMENTE 4 parágrafos nessa ordem:

**Parágrafo 1 — A MUDANÇA do mês.**
Comece com o que mudou desde a última análise. Resolvido vs. novo, captado vs. detectado, sinais que apareceram. Se a primeira leitura ainda não tem comparativo, descreva o que Vestigio observou no ciclo recém-completado.

**Parágrafo 2 — O TEMA dominante.**
Identifique a pista comum entre os vazamentos abertos. Use o tema dominante (consistência da mensagem, preparo para escala, sinais de confiança, etc.), a página mais concentrada, ou a categoria de causa que aparece mais vezes. Esse parágrafo precisa dar nome a um tema, não enumerar lista.

**Parágrafo 3 — O QUE ESTÁ EM JOGO.**
Quantifique a perda potencial total. Use o R$/mês total + número de vazamentos DISTINTOS que compõem a soma (use distinctExposurePoints, NÃO o raw count). Enquadre como "receita teoricamente em risco se nada mudar" — não como promessa de captura.

**Parágrafo 4 — A DECISÃO.**
Aponte para o movimento principal do mês. Cite o tema/página central (não cite Passo 1 ainda — esse parágrafo motiva a leitura dos Próximos Passos sem se sobrepor a eles).

Vocabulário CUSTOMER-FACING obrigatório:
- "vazamento" / "perda potencial", NÃO "exposição"
- "página" ou "página inicial", NÃO "surface" nem "\`/\`" literal
- "tema dominante", NÃO "padrão dominante" abstrato
- "consistência da mensagem", "preparo para escala", "sinais de confiança", NÃO os identificadores internos (copy_alignment, scale_readiness, etc.)
- "caso isolado", NÃO "ponta"
- "movimento principal", NÃO "aposta principal" (Vestigio AFIRMA com base em dado, não aposta)

Regras estritas:
1. Português brasileiro, voz de analista sênior — claro, restrito, sem hype. Voz ATIVA, primeira pessoa do plural ("observamos", "detectamos", "mapeamos", "identificamos") quando precisar atribuir. Vestigio é sujeito que ATUA, não que comenta.
2. Marcação permitida: **negrito**, *itálico*, \`código inline\`, parágrafos separados por linha em branco. NADA de listas, cabeçalhos, HTML.
3. Toda afirmação numérica precisa vir dos dados abaixo. Não invente percentuais.
4. Total entre 180 e 240 palavras. Cada parágrafo entre 35 e 70 palavras. Mais curto é melhor que enchimento.
5. PROIBIDO mencionar "o engine", "a análise revelou", "foi capturado pelo sistema", "Junho trouxe" (passivas e sujeitos abstratos). PROIBIDO citar identificadores técnicos (snake_case, "compound_*", "priorityScore", "decisionKey"). PROIBIDO clichês de relatório ("é importante notar", "vale destacar", "é fundamental", "vale ler como").
6. PROIBIDO "Vestigio aposta", "Vestigio acredita", "Vestigio estima" — Vestigio AFIRMA com base em dado, não aposta. Verbos analíticos válidos como sujeito Vestigio: detectou, encontrou, mapeou, observou, identificou, rastreou, validou.
7. PROIBIDO nomes de tema abstratos sem instância concreta atrelada na mesma frase. Se citar um tema, prove-o com R$ específico OU página específica OU comportamento observável na frase seguinte. Tema sem âncora concreta = ruído.
8. PROIBIDO travessão (—) em qualquer parágrafo. Use ponto, vírgula, dois pontos, ou parênteses. Travessão é tic de LLM e identifica o texto como gerado.
9. PROIBIDO usar a palavra "exposição" em qualquer parágrafo. Substituir por "vazamento", "perda potencial" ou "receita em risco" conforme o contexto.`;

	const data: string[] = [];
	data.push(`Dados do mês ${i.monthLabelPt} para ${i.envDomain}:`);
	data.push("");
	data.push(`# Contexto do plano`);
	data.push(`- Primeiro plano deste env? ${i.isFirstPlan ? "SIM (use tom de onboarding)" : "Não"}`);
	if (i.positiveSample) {
		const where = i.positiveSample.surface ? ` em ${humanizeSurfaceCustomerFacing(i.positiveSample.surface)}` : "";
		data.push(`- PONTO POSITIVO (usar como abertura do Parágrafo 1): "${i.positiveSample.title}"${where} — está calibrado / segura receita`);
	}
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
	data.push(`# Tema dominante`);
	if (i.dominantPack) {
		const pct = Math.round(i.dominantPackShare * 100);
		data.push(`- Tema mais concentrado: ${humanizePack(i.dominantPack, "pt-BR")} (${pct}% dos vazamentos abertos)`);
	}
	if (i.dominantSurface) {
		const pct = Math.round(i.dominantSurfaceShare * 100);
		data.push(`- Página mais concentrada: ${humanizeSurfaceCustomerFacing(i.dominantSurface)} (${pct}% dos vazamentos abertos)`);
	}
	data.push(`- Problemas recorrentes (3+ ciclos): ${i.chronicCount}`);
	data.push("");
	data.push(`# O que está em jogo`);
	data.push(`- Perda potencial total: R$ ${i.exposureTotal.toLocaleString("pt-BR")}/mês`);
	data.push(`- Total de vazamentos DISTINTOS (use esse número, não o raw): ${i.distinctExposurePoints}`);
	data.push(`- Raw count de findings (NÃO surface para o customer): ${i.exposureFindingCount}`);
	if (i.topOpenFindings.length > 0) {
		data.push(`- Maiores vazamentos individuais:`);
		i.topOpenFindings.forEach((f) => {
			const where = f.surface ? ` em ${humanizeSurfaceCustomerFacing(f.surface)}` : "";
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
