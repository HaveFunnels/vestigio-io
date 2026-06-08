import type { SerpProvider, SerpQueryResult } from "./types";
import { tryCreateTavilyProvider } from "./tavily-search";
import { readSerpCache, writeSerpCache } from "./cache";

// ──────────────────────────────────────────────
// SERP provider factory + cached wrapper — Wave 25
//
// Single provider: Tavily Search ($0.04/1k, AI-relevance ordering,
// locale-aware via country mapping). When TAVILY_API_KEY is unset
// getSerpProvider() returns null and serp-observation skips silently
// (Wave 24's competitive_lens features keep working without SERP).
//
// Adding a second adapter (e.g. SearXNG self-hosted, LangSearch
// canary): create the adapter file, expose a tryCreate*() function,
// and fall through to it after Tavily. Interface unchanged.
//
// The cached wrapper enforces a per-env-per-query 24h TTL via
// ContentEnrichmentCache so repeated audit cycles don't burn the
// per-tier budget.
// ──────────────────────────────────────────────

let cachedProvider: SerpProvider | null | undefined = undefined;

export function getSerpProvider(): SerpProvider | null {
	if (cachedProvider !== undefined) return cachedProvider;
	cachedProvider = tryCreateTavilyProvider();
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
