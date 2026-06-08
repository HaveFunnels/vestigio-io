// ──────────────────────────────────────────────
// SERP types — Wave 25
//
// Provider-agnostic shape. Tavily is the active adapter; future
// SearXNG / SerpAPI / LangSearch adapters land here too. Single
// shape so the enrichment pass and signal extractors don't branch
// on provider.
// ──────────────────────────────────────────────

export interface SerpResultItem {
	/** 1-indexed organic rank. */
	rank: number;
	/** Result URL as returned by the provider (may include UTM, etc). */
	url: string;
	/** Hostname of the URL (lowercase, with subdomain stripped to apex
	 *  where possible — e.g. "blog.acme.com" → "acme.com"). Used for
	 *  competitor matching. */
	host: string;
	title: string;
	snippet: string;
	/** True when the result is a paid placement / sponsored. */
	is_paid?: boolean;
}

export interface SerpQueryResult {
	provider: string;
	query: string;
	locale: string;
	/** ISO-8601 timestamp of the fetch (or cache hit). */
	fetched_at: string;
	/** True when the query is a navigational intent (the user typed a
	 *  brand to find it, not to explore). */
	is_navigational: boolean;
	results: SerpResultItem[];
	/** Related queries the provider returns — useful for keyword expansion. */
	related: string[];
	/** Total organic results reported. */
	total_results: number;
	/** Whether the call hit the cache. Diagnostic only. */
	from_cache: boolean;
}

export interface SerpProvider {
	readonly name: string;
	/** Returns null when the provider is unavailable (no API key,
	 *  not configured, rate-limited beyond what we want to retry). */
	search(opts: { query: string; locale?: string; count?: number }): Promise<SerpQueryResult | null>;
}
