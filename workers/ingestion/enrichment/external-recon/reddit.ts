import { unreachable, type ReconResult } from "./types";
import { fetchDdg } from "./ddg-serp";

// ──────────────────────────────────────────────
// Reddit via DDG site:reddit.com search — Wave 12
//
// We DO NOT use Reddit's API: their 2024 Responsible Builder Policy
// and Data API Terms gate commercial small-scale access. Instead we
// run two parallel site-restricted DDG searches and parse Reddit
// thread URLs from the results. Zero keys, zero ToS, zero policy.
//
// Two queries per audit:
//   1) BRAND query — `site:reddit.com "<brand>"`
//      Captures: threads about the customer's brand specifically.
//      Drives: forum_absence + versus_pattern findings.
//
//   2) CATEGORY query — `site:reddit.com "<category>" alternatives`
//      (or "best <category>") — captures threads where potential
//      customers are asking about the SPACE the brand operates in,
//      but where the brand may or may not surface.
//      Drives: category_demand_unmet finding (when the space is
//      asking for tools/recommendations but the brand isn't even
//      mentioned in the conversation).
//
// The category hint is best-effort — derived from a noun phrase on
// the customer's homepage. When we can't infer one we skip the
// category query (still emit brand-only data).
// ──────────────────────────────────────────────

function isRedditThreadUrl(url: string): boolean {
	return /\breddit\.com\/r\/[^/]+\/comments\//i.test(url);
}

function extractSubreddit(url: string): string | null {
	const match = url.match(/reddit\.com\/r\/([^/]+)/i);
	return match ? match[1] : null;
}

interface ParsedHits {
	hits: Array<{
		title: string;
		url: string;
		snippet: string;
		subreddit: string | null;
	}>;
	subreddits: string[];
}

function parseRedditFromDdg(serp: { results: Array<{ domain: string; url: string; title: string; snippet: string }> } | null): ParsedHits {
	if (!serp) return { hits: [], subreddits: [] };
	const hits = serp.results
		.filter((r) => r.domain.endsWith("reddit.com") && isRedditThreadUrl(r.url))
		.map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.snippet,
			subreddit: extractSubreddit(r.url),
		}));
	const subreddits = Array.from(new Set(hits.map((h) => h.subreddit ?? ""))).filter(Boolean);
	return { hits, subreddits };
}

export interface RedditQueryHints {
	/** Optional category noun-phrase derived from the customer's homepage.
	 *  When provided, we run a second DDG query for category-level demand.
	 *  When absent or empty, only the brand query runs. */
	category?: string | null;
}

export async function queryReddit(
	brand: string,
	hints: RedditQueryHints = {},
): Promise<ReconResult> {
	const brandQuery = `site:reddit.com "${brand}"`;
	const brandSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(brandQuery)}`;

	const category = (hints.category ?? "").trim();
	const useCategoryQuery = category.length >= 3;
	const categoryQuery = useCategoryQuery
		? `site:reddit.com "${category}" alternatives`
		: null;

	const [brandSerp, categorySerp] = await Promise.all([
		fetchDdg(brandQuery),
		categoryQuery ? fetchDdg(categoryQuery) : Promise.resolve(null),
	]);

	if (!brandSerp) return unreachable(brandSearchUrl, "http_error");

	const brandHits = parseRedditFromDdg(brandSerp);
	const categoryHits = parseRedditFromDdg(categorySerp);

	// Brand-specific signals
	const questionThreads = brandHits.hits.filter(
		(r) =>
			/\?$/.test(r.title) ||
			/^(best|recommend|alternative|vs |which |what )/i.test(r.title),
	);
	const versusMentions = brandHits.hits.filter((r) =>
		/\b(vs|versus|alternative to|compared)\b/i.test(r.title),
	);

	// Category-level signals — does the brand show up at all in
	// conversations where buyers are shopping the category? A category
	// thread is interesting only when the brand DOES NOT appear in it.
	const brandRegex = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
	const categoryThreadsBrandAbsent = categoryHits.hits.filter(
		(r) => !brandRegex.test(r.title) && !brandRegex.test(r.snippet),
	);
	const categoryDemandSignals = categoryHits.hits.length;
	const brandSurfacedInCategory = categoryHits.hits.length - categoryThreadsBrandAbsent.length;

	return {
		reachable: true,
		fetched_url: brandSearchUrl,
		data: {
			brand_query: brandQuery,
			fetched_via: "ddg_site_search",

			// Brand-search aggregates
			total_hits: brandHits.hits.length,
			question_thread_count: questionThreads.length,
			versus_mention_count: versusMentions.length,
			subreddits: brandHits.subreddits.slice(0, 10),
			top_question_threads: questionThreads.slice(0, 5).map((r) => ({
				title: r.title,
				url: r.url,
				subreddit: r.subreddit,
				snippet: r.snippet,
			})),
			top_versus_threads: versusMentions.slice(0, 5).map((r) => ({
				title: r.title,
				url: r.url,
				subreddit: r.subreddit,
				snippet: r.snippet,
			})),

			// Category-search aggregates
			category_query: categoryQuery,
			category_total_hits: categoryHits.hits.length,
			category_demand_signals: categoryDemandSignals,
			category_brand_surfaced: brandSurfacedInCategory,
			category_brand_absent_threads: categoryThreadsBrandAbsent.length,
			category_subreddits: categoryHits.subreddits.slice(0, 10),
			top_category_threads: categoryThreadsBrandAbsent.slice(0, 5).map((r) => ({
				title: r.title,
				url: r.url,
				subreddit: r.subreddit,
				snippet: r.snippet,
			})),
		},
	};
}
