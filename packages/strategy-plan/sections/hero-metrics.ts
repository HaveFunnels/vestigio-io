// ──────────────────────────────────────────────
// Hero metrics generator — pure SQL, zero LLM
//
// Computes the 4 top-of-plan tiles: retained, captured, criticals
// open, in-progress. Deltas vs the previous month. 6-point sparkline
// for retained + captured.
//
// All queries are against indexed columns
// (environmentId, status, statusChangedAt) — fast even at 100k+
// findings per env.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, HeroMetricsOutput } from "../types";

function addMonths(d: Date, n: number): Date {
	const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
	return out;
}

function pctDelta(current: number, prev: number): number {
	if (prev === 0) return current === 0 ? 0 : 1;
	return (current - prev) / prev;
}

interface MonthlyAgg {
	retained: number;
	captured: number;
	criticals: number;
	inProgress: number;
}

async function aggregateMonth(
	prisma: PrismaClient,
	environmentId: string,
	start: Date,
	end: Date,
): Promise<MonthlyAgg> {
	// Retained: sum of impactMidpoint of positive-polarity active findings.
	// This is the "value being kept safe today" — mirrors the retention
	// snapshot from packages/value-caught.
	// Captured: sum of impactMidpoint of findings resolved in window.
	// Critical count: active findings with severity=critical.
	// In-progress: open Action rows in the window (NOT findings).
	const [retained, captured, criticals, inProgress] = await Promise.all([
		prisma.finding.aggregate({
			where: {
				environmentId,
				polarity: "positive",
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: end },
			},
			_sum: { impactMidpoint: true },
		}),
		prisma.finding.aggregate({
			where: {
				environmentId,
				status: "resolved",
				statusChangedAt: { gte: start, lt: end },
			},
			_sum: { impactMidpoint: true },
		}),
		prisma.finding.count({
			where: {
				environmentId,
				severity: "critical",
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: end },
			},
		}),
		// in_progress UserActions touched/created in the window. Best-effort
		// — falls back to 0 if the table doesn't have rows yet.
		prisma.userAction
			.count({
				where: {
					environmentId,
					status: "in_progress",
					updatedAt: { gte: start, lt: end },
				},
			})
			.catch(() => 0),
	]);

	return {
		retained: retained._sum.impactMidpoint ?? 0,
		captured: captured._sum.impactMidpoint ?? 0,
		criticals,
		inProgress,
	};
}

async function buildSpark(
	prisma: PrismaClient,
	environmentId: string,
	monthStart: Date,
	metric: "retained" | "captured",
): Promise<number[]> {
	// 6-month trailing series, oldest to newest.
	const points: number[] = [];
	for (let i = 5; i >= 0; i--) {
		const wStart = addMonths(monthStart, -i);
		const wEnd = addMonths(monthStart, -i + 1);
		const agg = await aggregateMonth(prisma, environmentId, wStart, wEnd);
		points.push(metric === "retained" ? agg.retained : agg.captured);
	}
	return points;
}

export async function generateHeroMetrics(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<HeroMetricsOutput> {
	const current = await aggregateMonth(prisma, ctx.environmentId, ctx.monthStart, ctx.monthEnd);
	const prev = await aggregateMonth(
		prisma,
		ctx.environmentId,
		addMonths(ctx.monthStart, -1),
		ctx.monthStart,
	);

	const [retainedSpark, capturedSpark] = await Promise.all([
		buildSpark(prisma, ctx.environmentId, ctx.monthStart, "retained"),
		buildSpark(prisma, ctx.environmentId, ctx.monthStart, "captured"),
	]);

	return {
		retainedMid: Math.round(current.retained),
		capturedMid: Math.round(current.captured),
		criticalCount: current.criticals,
		inProgressCount: current.inProgress,
		retainedDeltaMoM: pctDelta(current.retained, prev.retained),
		capturedDeltaMoM: pctDelta(current.captured, prev.captured),
		criticalDeltaMoM: pctDelta(current.criticals, prev.criticals),
		inProgressDeltaMoM: pctDelta(current.inProgress, prev.inProgress),
		retainedSpark: retainedSpark.map((v) => Math.round(v)),
		capturedSpark: capturedSpark.map((v) => Math.round(v)),
	};
}
