import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Pixel-discovered crawl seeds
//
// The two halves of the product were not talking to each other.
//
// The pixel knows every page real visitors actually land on — for
// casamontelle.com that is 833 distinct landing URLs in a month,
// overwhelmingly product pages reached straight from TikTok/Meta ads.
// The crawler, meanwhile, discovers surfaces from the homepage, the
// sitemap, and a list of speculative critical-path guesses
// (/cart, /checkout, /precos...). On that same env it had 29 pages in
// inventory, 110 of 169 historical rows from `critical_path` guesses,
// and had never once fetched a /products/ URL — while the plan's
// thesis told the customer their leak was "concentrada na página do
// produto".
//
// This module closes that gap: the highest-traffic landing URLs the
// pixel observed become crawl seeds, so the pages that actually
// receive paid traffic get analysed.
//
// `behavioral_event` already existed in the DiscoverySource union
// ("sent from the in-browser pixel") with no writer anywhere. This is
// that writer.
// ──────────────────────────────────────────────

/** How far back to look for landing URLs. Matches the behavioral
 *  reporting window used elsewhere in the plan. */
export const BEHAVIORAL_SEED_WINDOW_DAYS = 30;

/** Default ceiling on seeds handed to one cycle. The full-mode crawl
 *  budget is 30 pages per domain, so flooding it with 800 product URLs
 *  would starve the homepage/checkout surfaces that anchor the rest of
 *  the analysis. Top-N by session volume keeps the money pages without
 *  displacing the structural ones. */
export const DEFAULT_BEHAVIORAL_SEED_CAP = 25;

export interface BehavioralSeed {
	url: string;
	sessions: number;
}

interface RawRow {
	landing_url: string | null;
	sessions: bigint | number;
}

/**
 * Top landing URLs by session volume for an environment, newest
 * window first.
 *
 * Aggregated in SQL rather than in JS: BehavioralSessionAggregate
 * holds ~170k rows for a single active env, and we only need a
 * 25-row answer.
 *
 * Returns [] on any failure — seeds are an enhancement to discovery,
 * never a precondition for it.
 */
export async function resolveBehavioralSeeds(
	prisma: PrismaClient,
	environmentId: string,
	rootDomain: string,
	cap: number = DEFAULT_BEHAVIORAL_SEED_CAP,
): Promise<BehavioralSeed[]> {
	const since = new Date(
		Date.now() - BEHAVIORAL_SEED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	);
	try {
		const rows = await prisma.$queryRaw<RawRow[]>`
			SELECT
				(aggregate::jsonb #>> '{attribution,first_touch,landing_url}') AS landing_url,
				COUNT(*) AS sessions
			FROM "BehavioralSessionAggregate"
			WHERE "envId" = ${environmentId}
				AND "startedAt" >= ${since}
			GROUP BY 1
			HAVING (aggregate::jsonb #>> '{attribution,first_touch,landing_url}') IS NOT NULL
			ORDER BY sessions DESC
			LIMIT ${cap * 4}
		`;

		const seeds: BehavioralSeed[] = [];
		const seen = new Set<string>();
		for (const r of rows) {
			if (!r.landing_url) continue;
			let parsed: URL;
			try {
				parsed = new URL(r.landing_url);
			} catch {
				continue;
			}
			// Same-domain only. The pipeline enforces this again, but
			// filtering here keeps the cap honest — otherwise a burst of
			// off-domain referrer URLs could consume every slot.
			if (!parsed.hostname.endsWith(rootDomain)) continue;
			// Strip query + hash: ad traffic arrives with utm/fbclid/ttclid
			// noise that would otherwise fragment one page into dozens of
			// "distinct" seeds and blow the cap on a single product.
			const clean = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "") || parsed.origin;
			if (seen.has(clean)) continue;
			seen.add(clean);
			seeds.push({ url: clean, sessions: Number(r.sessions) });
			if (seeds.length >= cap) break;
		}
		return seeds;
	} catch (err) {
		console.warn(
			`[behavioral-seeds] lookup failed for env ${environmentId}:`,
			err instanceof Error ? err.message : err,
		);
		return [];
	}
}
