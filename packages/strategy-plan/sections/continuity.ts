// ──────────────────────────────────────────────
// E3 — Continuity from prior month's plan
//
// Tells the customer: "Em Maio você priorizou X. Status atual: Y.
// Aqui está o que muda no Junho por causa disso." Without this
// section every plan reads as a one-off report, easy to cancel
// because nothing accumulates across months.
//
// Pure SQL — no LLM. Reads the prior month's PlanNextStep rows and
// joins their linkedFindingRefs against current Finding state to
// derive a status delta per step.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";

export interface ContinuityStep {
	/** Verbatim title from last month's plan — keeps the customer's
	 *  recognition anchor intact. */
	title: string;
	/** Status the step carries today (member-editable inline). When the
	 *  customer never touched it, this is "todo". */
	statusNow: "todo" | "in_progress" | "in_review" | "done" | "blocked";
	/** Among the linkedFindingRefs (inferenceKey strings) of last month's
	 *  step, how many are now status='resolved'. Lets the UI render
	 *  "5 de 7 problemas resolvidos" without an extra round-trip. */
	resolvedLinkedCount: number;
	totalLinkedCount: number;
	/** Sum of impactMidpoint of resolved linked findings. */
	capturedImpact: number;
}

export interface ContinuityOutput {
	/** When the prior-month plan doesn't exist (e.g. month-1 envs), this
	 *  is null and the UI hides the entire section. */
	previousMonthLabel: string | null;
	previousMonth: string | null; // YYYY-MM
	steps: ContinuityStep[];
	/** Net delta in TOTAL exposure between last month's plan generation
	 *  and now. Positive number means exposure grew (problems got worse
	 *  faster than they were fixed); negative means net progress. */
	exposureDeltaSinceLastPlan: number;
	/** Total captured impact across all resolved-since-last-plan
	 *  findings. Mirrors heroMetrics.capturedMid for the period. */
	capturedSinceLastPlan: number;
}

function previousMonthOf(month: string): string {
	const [y, m] = month.split("-").map(Number);
	const d = new Date(Date.UTC(y, m - 2, 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ptMonthLabel(month: string): string {
	const [y, m] = month.split("-").map(Number);
	const names = [
		"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
		"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
	];
	return `${names[m - 1]} ${y}`;
}

export async function generateContinuity(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<ContinuityOutput> {
	const prevMonth = previousMonthOf(ctx.month);
	const prevPlan = await prisma.monthlyStrategyPlan.findUnique({
		where: {
			environmentId_month: {
				environmentId: ctx.environmentId,
				month: prevMonth,
			},
		},
		select: {
			id: true,
			generatedAt: true,
			nextSteps: {
				select: {
					title: true,
					status: true,
					linkedFindingRefsJson: true,
				},
				orderBy: { order: "asc" },
			},
		},
	});

	if (!prevPlan) {
		return {
			previousMonthLabel: null,
			previousMonth: null,
			steps: [],
			exposureDeltaSinceLastPlan: 0,
			capturedSinceLastPlan: 0,
		};
	}

	// Gather all inferenceKeys referenced across the prior plan's steps
	// so we can do a single Finding lookup instead of N round-trips.
	const allInferenceKeys = new Set<string>();
	for (const s of prevPlan.nextSteps) {
		const refs = (s.linkedFindingRefsJson as string[]) ?? [];
		for (const k of refs) allInferenceKeys.add(k);
	}

	// Pull current state of those findings. Multiple Finding rows can
	// share an inferenceKey across cycles; we collapse to the latest one
	// per key (which represents the engine's most recent verdict).
	const findingRows = allInferenceKeys.size === 0
		? []
		: await prisma.finding.findMany({
				where: {
					environmentId: ctx.environmentId,
					inferenceKey: { in: Array.from(allInferenceKeys) },
				},
				select: {
					inferenceKey: true,
					status: true,
					impactMidpoint: true,
					statusChangedAt: true,
				},
				orderBy: { statusChangedAt: "desc" },
			});

	type LatestByKey = { status: string; impactMidpoint: number; statusChangedAt: Date };
	const latestByKey = new Map<string, LatestByKey>();
	for (const row of findingRows) {
		if (!latestByKey.has(row.inferenceKey)) {
			latestByKey.set(row.inferenceKey, {
				status: row.status,
				impactMidpoint: row.impactMidpoint,
				statusChangedAt: row.statusChangedAt,
			});
		}
	}

	let totalCaptured = 0;
	const steps: ContinuityStep[] = prevPlan.nextSteps.map((s) => {
		const refs = (s.linkedFindingRefsJson as string[]) ?? [];
		let resolved = 0;
		let captured = 0;
		for (const k of refs) {
			const latest = latestByKey.get(k);
			if (!latest) continue;
			if (latest.status === "resolved" && latest.statusChangedAt >= prevPlan.generatedAt) {
				resolved += 1;
				captured += latest.impactMidpoint;
			}
		}
		totalCaptured += captured;
		return {
			title: s.title,
			statusNow: s.status as ContinuityStep["statusNow"],
			resolvedLinkedCount: resolved,
			totalLinkedCount: refs.length,
			capturedImpact: Math.round(captured),
		};
	});

	// Compute exposure deltas. "Now" = open loss findings at end of
	// the current plan's window. "Then" = open loss findings at the
	// moment the prior plan was generated.
	const [exposureNow, exposureThen] = await Promise.all([
		prisma.finding.aggregate({
			where: {
				environmentId: ctx.environmentId,
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: ctx.monthEnd },
			},
			_sum: { impactMidpoint: true },
		}),
		prisma.finding.aggregate({
			where: {
				environmentId: ctx.environmentId,
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: prevPlan.generatedAt },
			},
			_sum: { impactMidpoint: true },
		}),
	]);

	const exposureDelta =
		Math.round(exposureNow._sum.impactMidpoint ?? 0) -
		Math.round(exposureThen._sum.impactMidpoint ?? 0);

	return {
		previousMonthLabel: ptMonthLabel(prevMonth),
		previousMonth: prevMonth,
		steps,
		exposureDeltaSinceLastPlan: exposureDelta,
		capturedSinceLastPlan: Math.round(totalCaptured),
	};
}
