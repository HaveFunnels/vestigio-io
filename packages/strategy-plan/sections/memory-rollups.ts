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
	// Window semantics: "trailing N months INCLUDING the plan's own
	// month". Previous implementation used `end = monthStart` which
	// meant "prior calendar months only" — for a brand-new env whose
	// findings all carry createdAt inside the plan's month, every
	// window returned 0 and the Memory section read as if nothing was
	// happening. Including the current month captures the engine's
	// work in 1m the first time a customer reads the plan.
	const start = addMonths(monthStart, -monthsBack + 1);
	const end = addMonths(monthStart, 1);

	// Verified customer actions, not Finding.status="resolved". The
	// hero card was fixed this way after havefunnels saw R$ 67k
	// "recuperado" without closing a single action; this section kept
	// the old source and the Sept/2026 cross-exam caught it announcing
	// a "biggest win" on the day the detector stopped firing — which was
	// also the day the detector was fixed. An action row here means the
	// customer marked work done AND the next cycle confirmed the finding
	// gone. That is the only thing "recuperado" may be built from.
	const resolved = await prisma.userAction.findMany({
		where: {
			environmentId,
			status: "done",
			verifiedResolvedAt: { gte: start, lt: end, not: null },
		},
		select: {
			title: true,
			baselineImpactMidpoint: true,
			verifiedResolvedAt: true,
			finding: { select: { pack: true } },
		},
		orderBy: { baselineImpactMidpoint: "desc" },
	});

	// Sprint 3.4 — also count every finding the engine *detected* in
	// the window, irrespective of resolution. Surfaces Vestigio's
	// continuous work in the Memory card even when the customer
	// hasn't acted on anything yet (which is the common case for
	// new envs). Without this the card reads as a flat "0 resolvidas
	// · R$ 0 capturado" and the product looks idle.
	const findingsDetected = await prisma.finding.count({
		where: {
			environmentId,
			createdAt: { gte: start, lt: end },
		},
	});

	const capturedTotal = Math.round(
		resolved.reduce((a, r) => a + (r.baselineImpactMidpoint ?? 0), 0),
	);

	// Top packs by count, via each action's linked finding.
	const packCounts: Record<string, number> = {};
	for (const r of resolved) {
		const pack = r.finding?.pack;
		if (pack) packCounts[pack] = (packCounts[pack] ?? 0) + 1;
	}
	const topCategories = Object.entries(packCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([pack]) => pack);

	// Biggest win — the customer's highest-impact verified action, named
	// by what they did rather than by the detector key that went quiet.
	const biggestRow = resolved[0];
	const biggestWin = biggestRow?.verifiedResolvedAt
		? {
			title: biggestRow.title,
			capturedAmount: Math.round(biggestRow.baselineImpactMidpoint ?? 0),
			resolvedAt: biggestRow.verifiedResolvedAt.toISOString().slice(0, 10),
		}
		: undefined;

	// Month-by-month values within the window — fill zeros for months
	// with no resolutions so the bar chart's x-axis stays continuous.
	const buckets: Record<string, number> = {};
	for (const r of resolved) {
		if (!r.verifiedResolvedAt) continue;
		const key = ymKey(r.verifiedResolvedAt);
		buckets[key] = (buckets[key] ?? 0) + (r.baselineImpactMidpoint ?? 0);
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
		findingsDetected,
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
	const [w1, w3, w6, w12, firstActivity] = await Promise.all([
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 1),
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 3),
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 6),
		buildWindow(prisma, ctx.environmentId, ctx.monthStart, 12),
		prisma.auditCycle.findFirst({
			where: { environmentId: ctx.environmentId },
			orderBy: { createdAt: "asc" },
			select: { createdAt: true },
		}),
	]);

	// Windows that reach back before the account existed get flagged
	// rather than silently padded: a 12-month card on a 2-month account
	// repeats the same few datapoints in every window and reads as a
	// year of history that never happened (caught in the Sept/2026
	// cross-exam as pure visual noise).
	if (firstActivity) {
		const accountSince = ymKey(firstActivity.createdAt);
		for (const [months, w] of [[1, w1], [3, w3], [6, w6], [12, w12]] as const) {
			const windowStart = addMonths(ctx.monthStart, -months + 1);
			if (firstActivity.createdAt > windowStart) {
				w.insufficientHistory = true;
				w.accountSince = accountSince;
			}
		}
	}
	return { "1m": w1, "3m": w3, "6m": w6, "12m": w12 };
}
