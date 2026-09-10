// ──────────────────────────────────────────────
// Value preview generator — deterministic timeline
//
// Computes the 4-marker horizontal timeline (now, M3, M6, M12) based
// on the env's current state:
//   - integrations connected (Stripe / Meta / Shopify): unlocks
//     behavioral + revenue context at M3
//   - cycles of history: unlocks finer-grained findings at M6
//   - cross-customer benchmark availability: unlocks at M12
//
// Phase B = deterministic shape. Phase C adds the LLM narrative
// (`valuePreviewNarrative`) that personalizes the next milestone
// callout in a single Haiku call. The structured timeline below is
// LLM-free.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, ValuePreviewOutput } from "../types";

function diffMonths(from: Date, to: Date): number {
	const years = to.getUTCFullYear() - from.getUTCFullYear();
	const months = to.getUTCMonth() - from.getUTCMonth();
	return years * 12 + months;
}

export async function generateValuePreview(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<ValuePreviewOutput> {
	// Env age in months (since first cycle).
	const firstCycle = await prisma.auditCycle.findFirst({
		where: { environmentId: ctx.environmentId },
		orderBy: { createdAt: "asc" },
		select: { createdAt: true },
	});
	const envAgeMonths = firstCycle
		? Math.max(0, diffMonths(firstCycle.createdAt, ctx.monthStart))
		: 0;

	// Has any cross-source signal (Stripe / Meta / Shopify / etc.)
	// been connected? Checks the IntegrationConnection table for
	// status='connected'. Falls back to false on query error.
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

	// Marker payload. HONESTY RULE (docs/EXAME_DO_PLANO.md P20): a
	// milestone may only name a capability that ships TODAY. No invented
	// stats ("~40% mais específicas"), no phantom services ("benchmark vs
	// categoria" had no implementation), no vendor guesses ("Stripe" told
	// to a PIX store), no engine-speak ("memory rollups") — the customer
	// checks these promises against reality, and one broken promise
	// poisons every real number in the plan.
	const isEcommerce = (ctx.businessContext?.vertical ?? "").toLowerCase().includes("commerce");
	const adsLabel = isEcommerce
		? "dados de anúncio (Meta/Google) refinam as estimativas"
		: "dados de pagamento e anúncio refinam as estimativas";
	return {
		currentMonth: {
			label: "Hoje · M1",
			unlocked: [
				"análise contínua do site",
				"comportamento real medido pelo pixel",
				"plano mensal com prioridades",
			],
			icon: "check",
		},
		milestoneM3: {
			label: "M3",
			eta: monthsUntil(envAgeMonths, 3),
			unlocked: hasCrossSourceSignal
				? [adsLabel, "comparação real mês a mês"]
				: ["comparação real mês a mês", `conectando anúncios: ${adsLabel}`],
			icon: envAgeMonths >= 3 ? "check" : "pending",
		},
		milestoneM6: {
			label: "M6",
			eta: monthsUntil(envAgeMonths, 6),
			unlocked: ["tendência por página ao longo de 6 meses", "o que voltou a quebrar vs o que ficou resolvido"],
			icon: envAgeMonths >= 6 ? "check" : envAgeMonths >= 3 ? "pending" : "future",
		},
		milestoneM12: {
			label: "M12",
			eta: monthsUntil(envAgeMonths, 12),
			unlocked: ["um ano de histórico: comparação ano a ano", "sazonalidade real do seu funil"],
			icon: envAgeMonths >= 12 ? "check" : envAgeMonths >= 9 ? "pending" : "future",
		},
	};
}

function monthsUntil(envAge: number, target: number): string | undefined {
	const delta = target - envAge;
	if (delta <= 0) return undefined; // already passed
	if (delta === 1) return "em 1 mês";
	return `em ${delta} meses`;
}
