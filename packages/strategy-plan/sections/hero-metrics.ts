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
	// Wave-22.6 review fix P3.1 — range + count receipts for the
	// AggregateMethodologyPopover on the hero tiles.
	retainedMin: number;
	retainedMax: number;
	retainedCount: number;
	capturedMin: number;
	capturedMax: number;
	capturedCount: number;
	// T1 — exposure: monetary mass of OPEN loss findings. Surfaces
	// "what's at stake right now" on month 1 envs where retained +
	// captured are both 0 (engine has discovered loss findings but the
	// customer hasn't acted on anything yet, so nothing is "kept" or
	// "captured" — but plenty is bleeding). The hero card UI falls
	// back to this number when captured == 0 so the customer never
	// sees a row of zeros.
	exposure: number;
	exposureMin: number;
	exposureMax: number;
	exposureCount: number;
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
	const [retained, captured, criticals, inProgress, exposure] = await Promise.all([
		prisma.finding.aggregate({
			where: {
				environmentId,
				polarity: "positive",
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: end },
			},
			_sum: { impactMidpoint: true, impactMin: true, impactMax: true },
			_count: { _all: true },
		}),
		prisma.finding.aggregate({
			where: {
				environmentId,
				status: "resolved",
				statusChangedAt: { gte: start, lt: end },
			},
			_sum: { impactMidpoint: true, impactMin: true, impactMax: true },
			_count: { _all: true },
		}),
		// T3 — count "criticals" by calibrated impact threshold rather than
		// by engine-assigned severity. The engine assigns severity from
		// inference heuristics that often disagree with the financial
		// impact model; on havefunnels every step rendered as HIGH or
		// MEDIUM even though several had R$ 5k+/mês exposure. Using the
		// impact threshold keeps this aligned with calibrateSeverity in
		// next-steps.ts.
		prisma.finding.count({
			where: {
				environmentId,
				impactMidpoint: { gte: 5000 },
				polarity: { in: ["negative", "neutral"] },
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
		// T1 — exposure: open loss findings' total monetary mass. The hero
		// shows this when captured == 0 so the customer always sees a
		// concrete number on the dollars-tile, not "R$ 0".
		prisma.finding.aggregate({
			where: {
				environmentId,
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: end },
			},
			_sum: { impactMidpoint: true, impactMin: true, impactMax: true },
			_count: { _all: true },
		}),
	]);

	return {
		retained: retained._sum.impactMidpoint ?? 0,
		captured: captured._sum.impactMidpoint ?? 0,
		criticals,
		inProgress,
		retainedMin: retained._sum.impactMin ?? 0,
		retainedMax: retained._sum.impactMax ?? 0,
		retainedCount: retained._count?._all ?? 0,
		capturedMin: captured._sum.impactMin ?? 0,
		capturedMax: captured._sum.impactMax ?? 0,
		capturedCount: captured._count?._all ?? 0,
		exposure: exposure._sum.impactMidpoint ?? 0,
		exposureMin: exposure._sum.impactMin ?? 0,
		exposureMax: exposure._sum.impactMax ?? 0,
		exposureCount: exposure._count?._all ?? 0,
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
		retainedMin: Math.round(current.retainedMin),
		retainedMax: Math.round(current.retainedMax),
		retainedFindingCount: current.retainedCount,
		capturedMin: Math.round(current.capturedMin),
		capturedMax: Math.round(current.capturedMax),
		capturedFindingCount: current.capturedCount,
		exposureMid: Math.round(current.exposure),
		exposureMin: Math.round(current.exposureMin),
		exposureMax: Math.round(current.exposureMax),
		exposureFindingCount: current.exposureCount,
	};
}
