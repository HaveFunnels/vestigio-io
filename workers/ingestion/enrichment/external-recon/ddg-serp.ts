import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// DuckDuckGo HTML SERP scraper — Wave 12
//
// Zero-cost, no auth. DDG's html.duckduckgo.com endpoint is the
// legacy HTML interface meant for low-bandwidth clients — it has no
// JS gate and the markup is stable enough for scraping.
//
// We extract two SERP shapes:
//
//   1) Branded search — query = brand name. Top 10 results.
//      Inferences look for: own_domain rank, affiliate domains
//      outranking, competitor presence, parasite SEO.
//
//   2) Category-intent search — query = "<category> alternatives" or
//      "best <category>", parameterized by businessModel. Top 10.
//      Inferences look for: customer's domain presence anywhere on page 1.
//
// PAA (People Also Ask) — DDG doesn't surface PAA. We approximate it
// by parsing the "Related searches" box at the bottom of the page,
// which serves a similar discoverability signal.
//
// Risk: DDG HTML may change without notice. Scraper is intentionally
// shallow (only extracts result URLs + the related-searches block)
// so when markup shifts we lose at most metadata, not structure.
// ──────────────────────────────────────────────

const DDG_BASE = "https://html.duckduckgo.com/html/";

interface DdgResult {
	domain: string;
	url: string;
	title: string;
	snippet: string;
	rank: number;
}

interface DdgSerp {
	query: string;
	results: DdgResult[];
	related_searches: string[];
	total_parsed: number;
}

/**
 * Extract organic results from DDG HTML. Their result block looks like:
 *   <a class="result__a" href="...">title</a>
 *   <a class="result__url" href="...">visible-url</a>
 *   <a class="result__snippet">snippet text</a>
 * We use a forgiving regex pass over the body — JSDOM would be safer
 * but adds 60ms cold-start and 5MB. Worth it: probably not in this
 * pipeline where we already accept the scraper as a brittle layer.
 */
function parseDdgHtml(html: string): { results: DdgResult[]; related: string[] } {
	const results: DdgResult[] = [];
	// Each result is wrapped in a <div class="result"> or similar.
	// We anchor on result__a anchors then look back for the URL.
	const linkRe =
		/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	const urlRe =
		/<a[^>]+class="[^"]*result__url[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
	const snippetRe =
		/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

	const linkMatches = Array.from(html.matchAll(linkRe));
	const urlMatches = Array.from(html.matchAll(urlRe));
	const snippetMatches = Array.from(html.matchAll(snippetRe));

	const max = Math.min(linkMatches.length, 10);
	for (let i = 0; i < max; i++) {
		const rawHref = linkMatches[i]?.[1] ?? "";
		const title = stripTags(linkMatches[i]?.[2] ?? "").trim();
		const visibleUrl = stripTags(urlMatches[i]?.[1] ?? "").trim();
		const snippet = stripTags(snippetMatches[i]?.[1] ?? "")
			.trim()
			.slice(0, 240);

		// DDG wraps result URLs in /l/?uddg=<encoded> — unwrap.
		const finalUrl = unwrapDdgUrl(rawHref);
		const domain = extractDomain(finalUrl || visibleUrl);
		if (!domain) continue;
		results.push({
			domain,
			url: finalUrl || visibleUrl,
			title,
			snippet,
			rank: i + 1,
		});
	}

	// Related searches block — <a class="related_search">text</a>
	const relatedRe =
		/<a[^>]+class="[^"]*related_search[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
	const related: string[] = [];
	for (const m of html.matchAll(relatedRe)) {
		const txt = stripTags(m[1]).trim();
		if (txt) related.push(txt);
		if (related.length >= 10) break;
	}

	return { results, related };
}

function unwrapDdgUrl(href: string): string {
	if (!href.startsWith("//duckduckgo.com/l/") && !href.startsWith("/l/")) {
		return href.startsWith("//") ? `https:${href}` : href;
	}
	try {
		const u = new URL(href, "https://duckduckgo.com");
		const enc = u.searchParams.get("uddg");
		return enc ? decodeURIComponent(enc) : href;
	} catch {
		return href;
	}
}

function extractDomain(rawUrl: string): string | null {
	if (!rawUrl) return null;
	try {
		const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
		return u.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return null;
	}
}

function stripTags(s: string): string {
	return s
		.replace(/<[^>]*>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ");
}

export async function fetchDdg(query: string): Promise<DdgSerp | null> {
	const url = `${DDG_BASE}?q=${encodeURIComponent(query)}&kl=us-en`;
	const res = await reconFetch(url, {
		// DDG HTML accepts both GET and POST; GET is simpler. POST with
		// form-encoded body sometimes returns the standalone results
		// snippet. Stick with GET for fewer moving parts.
		method: "GET",
	});
	if (!res || !res.ok) return null;
	const html = await res.text();
	const parsed = parseDdgHtml(html);
	return {
		query,
		results: parsed.results,
		related_searches: parsed.related,
		total_parsed: parsed.results.length,
	};
}

export async function scrapeBrandedSerp(
	brand: string,
	rootDomain: string,
): Promise<ReconResult> {
	const url = `${DDG_BASE}?q=${encodeURIComponent(brand)}&kl=us-en`;
	const serp = await fetchDdg(brand);
	if (!serp) return unreachable(url, "http_error");

	const ownDomain = rootDomain.replace(/^www\./, "").toLowerCase();
	const ownRank = serp.results.findIndex((r) =>
		r.domain === ownDomain || r.domain.endsWith(`.${ownDomain}`),
	);
	const competitorDomains = serp.results
		.filter((r) => !r.domain.includes(ownDomain))
		.map((r) => r.domain);
	const affiliateDomains = serp.results
		.filter((r) =>
			/review|alternatives|vs|top|best/i.test(r.url) ||
			/g2\.com|capterra|softwareadvice|getapp|productreview/i.test(r.domain),
		)
		.map((r) => r.domain);

	return {
		reachable: true,
		fetched_url: url,
		data: {
			query: brand,
			result_count: serp.results.length,
			own_rank: ownRank, // 0-indexed, -1 if not on page 1
			own_present: ownRank >= 0,
			top_competitor_domains: competitorDomains.slice(0, 5),
			affiliate_domains_in_top10: Array.from(new Set(affiliateDomains)),
			related_searches: serp.related_searches,
		},
	};
}

export async function scrapeCategoryIntentSerp(
	brand: string,
	businessModel: string | null,
): Promise<ReconResult> {
	// Without a category, we use the brand itself as a fallback proxy.
	// SaaS uses "alternatives" intent; ecommerce uses "best".
	const intentSuffix = businessModel === "saas" ? "alternatives" : "best";
	const query = `${brand} ${intentSuffix}`;
	const url = `${DDG_BASE}?q=${encodeURIComponent(query)}&kl=us-en`;
	const serp = await fetchDdg(query);
	if (!serp) return unreachable(url, "http_error");

	// For category intent, the question is: does the customer show up
	// AT ALL on page 1 when buyers are comparison-shopping?
	const brandRegex = new RegExp(`\\b${brand}\\b`, "i");
	const ownDomainHit = serp.results.findIndex((r) =>
		r.domain.includes(brand) || brandRegex.test(r.title) || brandRegex.test(r.snippet),
	);

	return {
		reachable: true,
		fetched_url: url,
		data: {
			query,
			intent_suffix: intentSuffix,
			result_count: serp.results.length,
			own_visible: ownDomainHit >= 0,
			own_rank_on_intent: ownDomainHit,
			competitor_domains: serp.results.map((r) => r.domain).slice(0, 10),
			top_titles: serp.results.slice(0, 5).map((r) => r.title.slice(0, 80)),
		},
	};
}
