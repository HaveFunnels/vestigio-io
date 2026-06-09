// ──────────────────────────────────────────────
// E4 — Cross-customer pattern callout
//
// Pulls a peer-pattern signal Vestigio can deliver and no generic SEO
// tool can: "X de Y orgs no seu segmento têm o mesmo padrão de Z;
// das que resolveram, a captura média foi R$ W/mês". This is the
// kind of sentence that justifies recurring spend because the data
// is internal-only.
//
// Gating: the callout only renders when sample size >= MIN_SAMPLE.
// On Vestigio at this stage the threshold is rarely met, so the
// section silently hides on most plans. That's intentional —
// hallucinated peer patterns from N=2 envs would damage trust more
// than they'd help. The wiring is in place so the section "turns on"
// automatically as the customer base grows.
//
// Cost: pure SQL. Two count queries scoped to a single pack key, both
// indexed on (environmentId, pack, status).
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";

const MIN_SAMPLE = 5;

export interface CrossCustomerPatternOutput {
	/** Pack key (e.g. "first_impression_revenue_pack") that the
	 *  callout names as the shared pattern. */
	pack: string;
	/** Human-readable pack name in the owner's locale. Falls back to
	 *  the canonical key humanized when the dict doesn't have it. */
	packLabel: string;
	/** Peer business model (e.g. "saas", "ecommerce"). */
	businessModel: string;
	/** Total peer envs in the same segment, excluding the current env. */
	peerCount: number;
	/** Of the peer envs, how many currently have open findings in this
	 *  pack. The "share with same pattern" number. */
	peersWithPattern: number;
	/** Of peersWithPattern, how many have at least one finding in this
	 *  pack marked resolved in the last 90 days. The "share who fixed
	 *  it" number. */
	peersWhoFixed: number;
	/** Average impactMidpoint of resolved peer findings in this pack.
	 *  Null if none have resolved. */
	avgCapturedImpact: number | null;
}

/**
 * Returns the pattern callout when the sample size warrants it, or
 * null when the segment hasn't accumulated enough peers to be
 * statistically honest. Callers render unconditionally and the UI
 * hides on null.
 */
export async function generateCrossCustomerPattern(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<CrossCustomerPatternOutput | null> {
	// 1. Identify the current env's businessModel via its org's
	//    BusinessProfile. Required for segmentation.
	const env = await prisma.environment.findUnique({
		where: { id: ctx.environmentId },
		select: { organization: { select: { businessProfile: { select: { businessModel: true } } } } },
	});
	const businessModel = env?.organization?.businessProfile?.businessModel;
	if (!businessModel) return null;

	// 2. Identify the current env's dominant pack — the pack with the
	//    largest count of open loss findings.
	const ownPacks = await prisma.finding.groupBy({
		by: ["pack"],
		where: {
			environmentId: ctx.environmentId,
			polarity: { in: ["negative", "neutral"] },
			status: { in: ["created", "confirmed"] },
		},
		_count: { _all: true },
		orderBy: { _count: { pack: "desc" } },
		take: 1,
	});
	const dominantPack = ownPacks[0]?.pack;
	if (!dominantPack) return null;

	// 3. Find peer environments in the same businessModel.
	const peers = await prisma.environment.findMany({
		where: {
			id: { not: ctx.environmentId },
			organization: { businessProfile: { businessModel } },
		},
		select: { id: true },
	});
	if (peers.length < MIN_SAMPLE) return null;

	// 4. Of those peers, how many have findings in the dominant pack?
	//    How many have at least one resolved in the last 90 days?
	const peerIds = peers.map((p) => p.id);
	const ninetyDaysAgo = new Date(ctx.monthEnd.getTime() - 90 * 86400000);

	const [withOpen, resolvedAgg] = await Promise.all([
		prisma.finding.findMany({
			where: {
				environmentId: { in: peerIds },
				pack: dominantPack,
				status: { in: ["created", "confirmed"] },
			},
			select: { environmentId: true },
			distinct: ["environmentId"],
		}),
		prisma.finding.findMany({
			where: {
				environmentId: { in: peerIds },
				pack: dominantPack,
				status: "resolved",
				statusChangedAt: { gte: ninetyDaysAgo },
			},
			select: { environmentId: true, impactMidpoint: true },
		}),
	]);

	const peersWithPattern = withOpen.length;
	const resolvedByEnv = new Map<string, number[]>();
	for (const r of resolvedAgg) {
		const arr = resolvedByEnv.get(r.environmentId) ?? [];
		arr.push(r.impactMidpoint);
		resolvedByEnv.set(r.environmentId, arr);
	}
	const peersWhoFixed = resolvedByEnv.size;

	const avgCapturedImpact = (() => {
		if (resolvedByEnv.size === 0) return null;
		// Average of per-env totals (avoid a single peer dominating).
		const perEnvTotals = Array.from(resolvedByEnv.values()).map((arr) =>
			arr.reduce((a, b) => a + b, 0),
		);
		return Math.round(perEnvTotals.reduce((a, b) => a + b, 0) / perEnvTotals.length);
	})();

	// Final gate — we have peers, but if none actually share the pattern,
	// the callout has nothing useful to say.
	if (peersWithPattern === 0) return null;

	const packKey = dominantPack.replace(/_pack$/, "");
	const packLabel =
		ctx.translations?.compound_type_titles?.[packKey]
		?? ctx.translations?.root_cause_titles?.[packKey]
		?? packKey.replace(/_/g, " ");

	return {
		pack: dominantPack,
		packLabel,
		businessModel,
		peerCount: peers.length,
		peersWithPattern,
		peersWhoFixed,
		avgCapturedImpact,
	};
}
