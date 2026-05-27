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

	// Standard marker payload — these don't depend on env state, just
	// on standard product onboarding.
	return {
		currentMonth: {
			label: "Hoje · M1",
			unlocked: ["surfaces visíveis", "findings públicos", "memory rollups"],
			icon: "check",
		},
		milestoneM3: {
			label: "M3",
			eta: monthsUntil(envAgeMonths, 3),
			unlocked: hasCrossSourceSignal
				? ["Stripe + behavioral já no engine"]
				: ["Stripe + behavioral entram no engine", "findings ~40% mais específicas"],
			icon: envAgeMonths >= 3 || hasCrossSourceSignal ? "check" : "pending",
		},
		milestoneM6: {
			label: "M6",
			eta: monthsUntil(envAgeMonths, 6),
			unlocked: ["benchmark vs categoria", "padrões cross-customer começam"],
			icon: envAgeMonths >= 6 ? "check" : envAgeMonths >= 3 ? "pending" : "future",
		},
		milestoneM12: {
			label: "M12",
			eta: monthsUntil(envAgeMonths, 12),
			unlocked: ["recommender com histórico completo", "predição de regressões"],
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
