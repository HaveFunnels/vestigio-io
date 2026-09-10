// ──────────────────────────────────────────────
// Honest aggregates — the two money numbers every plan section must
// agree on, computed one way.
//
// Both exist because the Sept/2026 cross-examination by a customer's
// own analytics team caught the plan doing the opposite:
//
//   "Recuperado" — hero-metrics had already been fixed (after
//   havefunnels showed R$ 67k recovered with zero actions closed) to
//   count only verified customer actions. But monthly-thesis and
//   memory-rollups still summed Finding.status="resolved" directly, so
//   the narrative announced "5 problemas resolvidos e R$ 23.750
//   recuperados" for findings whose detection merely stopped firing on
//   the day the plan was generated. Same bug, three implementations,
//   one of them fixed. This module is the single implementation.
//
//   Exposure — severity-percentage estimates summed with no ceiling,
//   reaching R$ 305k/month "at risk" against a store whose entire
//   measured revenue was R$ 198k. See packages/impact/exposure-cap.ts
//   for the cap and its reasoning; this module wires the declared
//   revenue to it.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { capExposure, type CappedExposure } from "../impact/exposure-cap";

/**
 * Declared monthly revenue for ONE environment.
 *
 * Order: the environment's own figure; the organization profile's
 * figure ONLY when the org has a single environment. An org-level
 * number over several stores is unattributable — HaveFunnels declares
 * R$ 580k across two environments while casamontelle alone measures
 * R$ 198k, so borrowing the org figure made the per-store cap wrong in
 * both directions (caught in the cross-exam round 2). Null means
 * undeclared, and the cap then hedges instead of guessing.
 */
export async function declaredMonthlyRevenue(
	prisma: PrismaClient,
	environmentId: string,
): Promise<number | null> {
	const env = await prisma.environment.findUnique({
		where: { id: environmentId },
		select: { monthlyRevenue: true, organizationId: true },
	});
	if (!env) return null;
	if (env.monthlyRevenue && env.monthlyRevenue > 0) return env.monthlyRevenue;

	const siblingCount = await prisma.environment.count({
		where: { organizationId: env.organizationId },
	});
	if (siblingCount !== 1) return null;

	const profile = await prisma.businessProfile.findUnique({
		where: { organizationId: env.organizationId },
		select: { monthlyRevenue: true },
	});
	return profile?.monthlyRevenue ?? null;
}

/** Cap an exposure sum against the environment's declared revenue. */
export async function cappedExposureFor(
	prisma: PrismaClient,
	environmentId: string,
	uncappedTotal: number,
): Promise<CappedExposure> {
	return capExposure(uncappedTotal, await declaredMonthlyRevenue(prisma, environmentId));
}

export interface VerifiedCaptured {
	/** Actions the customer marked done AND the next cycle confirmed the
	 *  linked finding actually disappeared. */
	count: number;
	/** Sum of what those actions promised at creation time
	 *  (baselineImpactMidpoint) — still an estimate, but one anchored to
	 *  work the customer verifiably did, not to detector state drift. */
	total: number;
}

/**
 * The only legitimate source for "resolvido / recuperado" claims.
 *
 * Finding.status="resolved" is NOT that source: lifecycle.ts marks a
 * finding resolved whenever it stops appearing in the next projection —
 * the site changed, the detection was transient, a threshold moved, or
 * the engine itself was fixed that morning. None of those are the
 * customer recovering money, and two of them happened on the very day
 * the September plan reported its "biggest win".
 */
export async function verifiedCaptured(
	prisma: PrismaClient,
	environmentId: string,
	start: Date,
	end: Date,
): Promise<VerifiedCaptured> {
	const agg = await prisma.userAction.aggregate({
		where: {
			environmentId,
			status: "done",
			verifiedResolvedAt: { gte: start, lt: end, not: null },
		},
		_sum: { baselineImpactMidpoint: true },
		_count: { _all: true },
	});
	return {
		count: agg._count._all ?? 0,
		total: Math.round(agg._sum.baselineImpactMidpoint ?? 0),
	};
}

export interface OpenExposureRow {
	inferenceKey: string;
	surface: string;
	pack: string;
	severity: string;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
}

export interface OpenExposure {
	/** Deduped open loss findings: one row per (inferenceKey, surface),
	 *  keeping the highest midpoint. The engine can emit several Finding
	 *  rows for the same real inference across cycles; summing rows
	 *  instead of inferences inflates the total with re-detections. */
	rows: OpenExposureRow[];
	distinctCount: number;
	/** Capped totals — the ONLY exposure figures any surface may show. */
	total: number;
	min: number;
	max: number;
	/** capped/uncapped, ≤ 1. Partitions of the total (per-team blocks)
	 *  multiply by this so their parts sum to exactly `total` — the
	 *  cross-exam's item (f): one aggregate, identical everywhere. */
	factor: number;
	revenueBasis: number;
	revenueDeclared: boolean;
	wasCapped: boolean;
}

/**
 * THE open-loss exposure for an environment. Hero, narrative, thesis
 * and buyer segments must all consume this — computing it in four
 * places is how the September plan showed three different totals for
 * the same concept.
 */
// GHOST v5 (Sept/2026): the finding lifecycle uses phantom rows, and
// TARGETED/hot verification cycles (1955 of them on Casa Montelle)
// write 'resolved' rows for findings they never actually re-checked —
// poisoning any "latest status" read. The only trustworthy open-set is
// the latest COMPREHENSIVE audit (full/cold): it re-emits the real
// open findings and, when a cause is genuinely gone (the /account
// trust boundary, suppressed by the measured-continuity gate), simply
// omits it. Both the exposure and the next-steps open-set scope to
// this cycle. Point-in-time preserved via createdAt < end.
export async function latestComprehensiveCycleId(
	prisma: PrismaClient,
	environmentId: string,
	end: Date,
): Promise<string | null> {
	const row = await prisma.finding.findFirst({
		where: {
			environmentId,
			createdAt: { lt: end },
			cycle: { status: "complete", cycleType: { in: ["full", "cold"] } },
		},
		orderBy: { createdAt: "desc" },
		select: { cycleId: true },
	});
	return row?.cycleId ?? null;
}

export async function openLossExposure(
	prisma: PrismaClient,
	environmentId: string,
	end: Date,
): Promise<OpenExposure> {
	// Scope to the latest comprehensive audit (see
	// latestComprehensiveCycleId): its open findings ARE the current
	// open-set, immune to targeted-cycle phantom-resolves. Empty when no
	// full/cold cycle exists yet → zero exposure (honest for a brand-new
	// env before its first full audit).
	const cycleId = await latestComprehensiveCycleId(prisma, environmentId, end);
	const raw = cycleId
		? await prisma.finding.findMany({
			where: {
				cycleId,
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created", "confirmed", "regressed"] },
			},
			select: {
				inferenceKey: true,
				surface: true,
				pack: true,
				severity: true,
				impactMin: true,
				impactMax: true,
				impactMidpoint: true,
			},
			orderBy: { impactMidpoint: "desc" },
		})
		: [];

	// One row per identity (unique per cycle already; dedupe defensively).
	const byIdentity = new Map<string, OpenExposureRow>();
	for (const r of raw) {
		const key = `${r.inferenceKey}::${r.surface}`;
		if (!byIdentity.has(key)) byIdentity.set(key, r);
	}
	const rows = [...byIdentity.values()];

	const uncapped = rows.reduce((a, r) => a + r.impactMidpoint, 0);
	const uncappedMin = rows.reduce((a, r) => a + r.impactMin, 0);
	const uncappedMax = rows.reduce((a, r) => a + r.impactMax, 0);

	const capped = capExposure(uncapped, await declaredMonthlyRevenue(prisma, environmentId));
	const factor = uncapped > 0 ? capped.total / uncapped : 1;

	return {
		rows,
		distinctCount: rows.length,
		total: capped.total,
		min: Math.round(uncappedMin * factor),
		max: Math.round(uncappedMax * factor),
		factor,
		revenueBasis: capped.revenueBasis,
		revenueDeclared: capped.revenueDeclared,
		wasCapped: capped.wasCapped,
	};
}

