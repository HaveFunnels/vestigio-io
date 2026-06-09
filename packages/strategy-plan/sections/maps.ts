// ──────────────────────────────────────────────
// Wave 22.8.4 — Maps section generator
//
// Sources:
//   1. Website rows for the env (1:1 in most envs; we iterate just in
//      case there are multiple).
//   2. SurfaceRelation rows for the latest cycle on each Website
//      (source/target hosts + relation type + isSameDomain).
//   3. CustomMap count for the org (org-scoped, not cycle-bound).
//
// Output surfaces the surface graph metadata rather than the maps
// themselves (those are derived in runtime by packages/maps/engine.ts
// from projections + result, so persisting them in the Plan would
// double-store data). The customer drills into /app/maps to see the
// full visual.
//
// Self-hide rule: if zero SurfaceRelation rows in the latest cycle
// AND zero CustomMaps in the org, the env has no graph yet — return
// null and the UI hides. Otherwise renders (graph-only mode is fine).
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
	GenerateContext,
	MapsSectionOutput,
	MapsTopHubOutput,
	MapsRelationTypeOutput,
} from "../types";

// Fixed catalog from packages/maps/types.ts MapType. The Plan exposes
// these names so the customer knows what /app/maps offers without
// requiring a query into the engine.
const AUTO_MAP_TYPES_PT_BR: string[] = [
	"Vazamento de receita",
	"Risco de chargeback",
	"Causa raiz",
	"Jornada do usuário",
];
const AUTO_MAP_TYPES_EN: string[] = [
	"Revenue leakage",
	"Chargeback risk",
	"Root cause",
	"User journey",
];

export async function generateMapsSection(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<MapsSectionOutput | null> {
	// 1. Find the env's websites + the org's CustomMap count in parallel.
	const env = await prisma.environment.findUnique({
		where: { id: ctx.environmentId },
		select: { organizationId: true },
	});
	if (!env) return null;

	const [websites, customMapsCount] = await Promise.all([
		prisma.website.findMany({
			where: { environmentRef: ctx.environmentId },
			select: { id: true },
		}),
		prisma.customMap.count({
			where: { organizationId: env.organizationId },
		}),
	]);

	if (websites.length === 0 && customMapsCount === 0) return null;

	const websiteIds = websites.map((w) => w.id);

	// 2. Find the most recent cycleRef across all the env's websites.
	const latestRelation = websiteIds.length === 0
		? null
		: await prisma.surfaceRelation.findFirst({
				where: { websiteRef: { in: websiteIds } },
				orderBy: { createdAt: "desc" },
				select: { cycleRef: true },
			});
	const cycleRef = latestRelation?.cycleRef ?? null;

	// 3. Pull this-cycle relations only.
	const relations = cycleRef
		? await prisma.surfaceRelation.findMany({
				where: {
					websiteRef: { in: websiteIds },
					cycleRef,
				},
				select: {
					sourceUrl: true,
					sourceHost: true,
					targetHost: true,
					relationType: true,
					isSameDomain: true,
				},
			})
		: [];

	// Final self-hide guard: nothing graph-side AND nothing org-side.
	if (relations.length === 0 && customMapsCount === 0) return null;

	// 4. Aggregations.
	const distinctHosts = new Set<string>();
	const relationsByTypeMap = new Map<string, number>();
	const outboundByUrl = new Map<string, number>();
	let crossDomainCount = 0;
	for (const r of relations) {
		distinctHosts.add(r.sourceHost);
		distinctHosts.add(r.targetHost);
		relationsByTypeMap.set(
			r.relationType,
			(relationsByTypeMap.get(r.relationType) ?? 0) + 1,
		);
		outboundByUrl.set(r.sourceUrl, (outboundByUrl.get(r.sourceUrl) ?? 0) + 1);
		if (!r.isSameDomain) crossDomainCount += 1;
	}

	const topHubs: MapsTopHubOutput[] = Array.from(outboundByUrl.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([url, outboundCount]) => ({ url, outboundCount }));

	const relationsByType: MapsRelationTypeOutput[] = Array.from(
		relationsByTypeMap.entries(),
	)
		.sort((a, b) => b[1] - a[1])
		.map(([relationType, count]) => ({ relationType, count }));

	return {
		cycleId: cycleRef,
		relationsThisCycle: relations.length,
		distinctHostCount: distinctHosts.size,
		crossDomainCount,
		topHubs,
		relationsByType,
		customMapsCount,
		autoMapTypes:
			ctx.locale === "pt-BR" ? AUTO_MAP_TYPES_PT_BR : AUTO_MAP_TYPES_EN,
	};
}
