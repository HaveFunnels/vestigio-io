import type { SerpProvider, SerpQueryResult } from "./types";
import { tryCreateBraveSearchProvider } from "./brave-search";
import { readSerpCache, writeSerpCache } from "./cache";

// ──────────────────────────────────────────────
// SERP provider factory + cached wrapper — Wave 25
//
// One choice point: pick the first provider with credentials
// configured. Order today: Brave Search → (future) SerpAPI → null.
//
// The cached wrapper enforces a per-env-per-query 24h TTL via
// ContentEnrichmentCache so repeated audit cycles don't burn the
// free-tier 2000 req/mo budget. Cache misses go to the live
// provider; both paths return the same SerpQueryResult shape.
// ──────────────────────────────────────────────

let cachedProvider: SerpProvider | null | undefined = undefined;

export function getSerpProvider(): SerpProvider | null {
	if (cachedProvider !== undefined) return cachedProvider;
	cachedProvider = tryCreateBraveSearchProvider();
	return cachedProvider;
}

/** Reset the memoized provider — only useful in tests when env vars
 *  change between cases. */
export function resetSerpProviderForTest(): void {
	cachedProvider = undefined;
}

export async function searchWithCache(
	envId: string,
	provider: SerpProvider,
	query: string,
	locale: string,
	count?: number,
): Promise<SerpQueryResult | null> {
	const cached = await readSerpCache(envId, provider.name, query, locale);
	if (cached) return cached;
	const fresh = await provider.search({ query, locale, count });
	if (!fresh) return null;
	await writeSerpCache(envId, provider.name, query, locale, fresh);
	return fresh;
}
