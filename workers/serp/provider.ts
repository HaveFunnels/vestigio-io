import type { SerpProvider, SerpQueryResult } from "./types";
import { tryCreateBraveSearchProvider } from "./brave-search";
import { tryCreateTavilyProvider } from "./tavily-search";
import { readSerpCache, writeSerpCache } from "./cache";

// ──────────────────────────────────────────────
// SERP provider factory + cached wrapper — Wave 25
//
// Provider preference order (first available wins):
//   1. Tavily Search — preferred at scale ($0.04/1k vs Brave $3/1k).
//      AI-relevance ordering, locale-aware via country mapping. The
//      target for 1k+ env audit-daily volume.
//   2. Brave Search — fallback when Tavily key is absent. Maintains
//      backward compatibility for envs that still ship the Brave key.
//
// Both adapters return SerpQueryResult — downstream code never
// branches on provider. When neither key is set, getSerpProvider()
// returns null and serp-observation skips silently (Wave 24's
// competitive_lens features keep working without SERP data).
//
// Adding a third adapter (e.g. SearXNG self-hosted, LangSearch
// canary): create the adapter file, expose a tryCreate*() function,
// and add it to the order array below — interface unchanged.
//
// The cached wrapper enforces a per-env-per-query 24h TTL via
// ContentEnrichmentCache so repeated audit cycles don't burn the
// per-tier budget.
// ──────────────────────────────────────────────

let cachedProvider: SerpProvider | null | undefined = undefined;

export function getSerpProvider(): SerpProvider | null {
	if (cachedProvider !== undefined) return cachedProvider;
	// Preference order: Tavily first (cheap at scale), Brave fallback.
	cachedProvider = tryCreateTavilyProvider() ?? tryCreateBraveSearchProvider();
	return cachedProvider;
}

/** Reset the memoized provider — useful in tests when env vars
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
