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

/** Declared monthly revenue from the business profile, null when the
 *  customer never filled it in. */
export async function declaredMonthlyRevenue(
	prisma: PrismaClient,
	environmentId: string,
): Promise<number | null> {
	// BusinessProfile hangs off the organization, not the environment.
	const env = await prisma.environment.findUnique({
		where: { id: environmentId },
		select: { organizationId: true },
	});
	if (!env) return null;
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
