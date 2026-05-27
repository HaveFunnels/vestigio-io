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
	if (i.nextMilestoneLabel && i.nextMilestoneMonths !== null) {
		const monthsTxt =
			i.nextMilestoneMonths <= 0
				? "neste mês"
				: i.nextMilestoneMonths === 1
					? "em 1 mês"
					: `em ${i.nextMilestoneMonths} meses`;
		return `Você tá há **${i.envAgeMonths} ${i.envAgeMonths === 1 ? "mês" : "meses"}** no Vestigio. O próximo marco é **${i.nextMilestoneLabel}** ${monthsTxt} — a partir daí o engine começa a destravar análises mais específicas pro seu ambiente.`;
	}
	return `Você completou **${i.cycleCount} ciclos** com o Vestigio e já tá rodando com histórico suficiente pro recommender prever regressões antes de elas surgirem.`;
}

function buildPrompt(i: PreviewInputs): { system: string; user: string } {
	const system = `Você escreve um parágrafo curto (máximo 2 frases, ~50 palavras) para a seção "O que você ganha continuando" de um Plano de Estratégia.

Regras:
1. Apenas 1-2 frases, português brasileiro.
2. Use **negrito** para destacar o tempo restante ou o número do mês.
3. Não invente métricas — use apenas os dados fornecidos.
4. Tom natural, conversacional, sem hype.`;

	const lines: string[] = [];
	lines.push(`Dados do ambiente ${i.envDomain}:`);
	lines.push(`- Tempo no Vestigio: ${i.envAgeMonths} ${i.envAgeMonths === 1 ? "mês" : "meses"}`);
	lines.push(`- Ciclos completos: ${i.cycleCount}`);
	lines.push(`- Stripe/Meta/behavioral conectado: ${i.hasCrossSourceSignal ? "sim" : "não"}`);
	if (i.nextMilestoneLabel) {
		lines.push(
			`- Próximo marco: ${i.nextMilestoneLabel} em ${i.nextMilestoneMonths ?? 0} meses`,
		);
	}
	lines.push("");
	lines.push("Escreva o parágrafo.");
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
