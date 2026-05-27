// ──────────────────────────────────────────────
// Memory rollups generator — pure SQL, zero LLM
//
// Aggregates the past 1m / 3m / 6m / 12m of activity per env:
//   - actionsResolved: count of findings that transitioned to
//     `status='resolved'` in the window
//   - capturedTotal: sum of impactMidpoint of those findings
//   - topCategories: 2-3 most-common packs among resolved findings
//   - biggestWin: the single highest-impact resolved finding
//   - monthlyValues: month-by-month captured for the mini bar chart
//   - benchmarkAvailability: stub (12m card only) — Wave 30+ writes
//     real benchmark data, until then we render the "available in N
//     months" placeholder
//
// Mirrors the value-caught package's window pattern + extends it.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
	GenerateContext,
	MemoryRollupsOutput,
	MemoryWindowOutput,
} from "../types";

function addMonths(d: Date, n: number): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function ymKey(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function windowLabel(months: number): string {
	if (months === 1) return "Último mês";
	if (months === 3) return "Últimos 3 meses";
	if (months === 6) return "Últimos 6 meses";
	return "Últimos 12 meses";
}

async function buildWindow(
	prisma: PrismaClient,
	environmentId: string,
	monthStart: Date,
	monthsBack: number,
): Promise<MemoryWindowOutput> {
	const start = addMonths(monthStart, -monthsBack);
	const end = monthStart;

	const resolved = await prisma.finding.findMany({
		where: {
			environmentId,
			status: "resolved",
			statusChangedAt: { gte: start, lt: end },
		},
		select: {
			pack: true,
			impactMidpoint: true,
			inferenceKey: true,
			surface: true,
			statusChangedAt: true,
		},
		orderBy: { impactMidpoint: "desc" },
	});

	const capturedTotal = Math.round(
		resolved.reduce((a, r) => a + r.impactMidpoint, 0),
	);

	// Top packs by count.
	const packCounts: Record<string, number> = {};
	for (const r of resolved) packCounts[r.pack] = (packCounts[r.pack] ?? 0) + 1;
	const topCategories = Object.entries(packCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([pack]) => pack);

	// Biggest win — the single highest-impact resolved finding.
	const biggestRow = resolved[0];
	const biggestWin = biggestRow
		? {
			title: `${biggestRow.inferenceKey.replace(/_/g, " ")} · ${biggestRow.surface}`,
			capturedAmount: Math.round(biggestRow.impactMidpoint),
			resolvedAt: biggestRow.statusChangedAt.toISOString().slice(0, 10),
		}
		: undefined;

	// Month-by-month values within the window — fill zeros for months
	// with no resolutions so the bar chart's x-axis stays continuous.
	const buckets: Record<string, number> = {};
	for (const r of resolved) {
		const key = ymKey(r.statusChangedAt);
		buckets[key] = (buckets[key] ?? 0) + r.impactMidpoint;
	}
	const monthlyValues: Array<{ month: string; value: number }> = [];
	for (let i = monthsBack - 1; i >= 0; i--) {
		const cursor = addMonths(end, -i - 1);
		const key = ymKey(cursor);
		monthlyValues.push({ month: key, value: Math.round(buckets[key] ?? 0) });
	}

	const out: MemoryWindowOutput = {
		label: windowLabel(monthsBack),
		actionsResolved: resolved.length,
		capturedTotal,
		topCategories,
		monthlyValues,
		...(biggestWin ? { biggestWin } : {}),
	};

	// 12-month window only: stub the benchmark placeholder. Wave 30+
	// will rewrite this to actually consult a benchmarks service.
	if (monthsBack === 12) {
		out.benchmarkAvailability = "available_in_4_months";
	}

	return out;
}

export async function generateMemoryRollups(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<MemoryRollupsOutput> {
	const [w1, w3, w6, w12] = await Promise.all([
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 1),
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 3),
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 6),
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 12),
	]);
	return { "1m": w1, "3m": w3, "6m": w6, "12m": w12 };
}
