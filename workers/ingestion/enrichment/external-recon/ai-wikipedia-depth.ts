import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// AI Wikipedia Depth probe — Wave 13 AI Visibility
//
// Wikipedia is heavily weighted by AI assistants — ~7.8% of all ChatGPT
// citations and far more for definition/category queries. But "having
// a Wikipedia article" isn't binary. The article needs to be:
//
//   - Substantive (>800 chars of body = beyond stub)
//   - Recently edited (within 18 months, signals it's maintained)
//   - Linked (linkshere count) — orphans are deprioritized by AI
//
// We use Wikipedia's public REST API (no auth, no rate limit at our
// scale) to fetch summary + page metadata. This extends the basic
// `industry_listing_wikipedia` probe in industry-listings.ts with
// depth metrics.
//
// Zero cost.
// ──────────────────────────────────────────────

interface WikipediaSummary {
	type?: string;
	extract?: string;
	timestamp?: string;
	content_urls?: { desktop?: { page?: string } };
	thumbnail?: { source?: string };
}

interface WikipediaPageInfo {
	revision?: { timestamp?: string };
	linkshere?: { count?: number };
	length?: number;
}

export async function probeWikipediaDepth(brand: string): Promise<ReconResult> {
	const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(brand)}`;
	const res = await reconFetch(summaryUrl);
	if (!res) return unreachable(summaryUrl, "timeout");
	if (res.status === 404) {
		return {
			reachable: true,
			fetched_url: summaryUrl,
			data: {
				exists: false,
				reason: "no_wikipedia_article",
			},
		};
	}
	if (!res.ok) return unreachable(summaryUrl, "http_error", { status: res.status });

	let summary: WikipediaSummary;
	try {
		summary = (await res.json()) as WikipediaSummary;
	} catch {
		return unreachable(summaryUrl, "parse_error");
	}

	// Disambiguation pages, missing titles — not a real authoritative article.
	if (summary.type !== "standard" && summary.type !== undefined) {
		return {
			reachable: true,
			fetched_url: summaryUrl,
			data: {
				exists: false,
				type: summary.type,
				reason: "non_standard_article_type",
			},
		};
	}

	const extract = summary.extract || "";
	const extractLength = extract.length;
	const lastEditedTs = summary.timestamp ? new Date(summary.timestamp) : null;
	const now = new Date();
	const monthsSinceEdit = lastEditedTs
		? (now.getTime() - lastEditedTs.getTime()) / (1000 * 60 * 60 * 24 * 30)
		: null;

	// Authoritative = substantive (>800 chars) AND recently edited (<18mo).
	// Stub-or-stale = either short OR not edited in >18mo.
	const isSubstantive = extractLength >= 800;
	const isFresh = monthsSinceEdit !== null && monthsSinceEdit < 18;
	const isAuthoritative = isSubstantive && isFresh;

	return {
		reachable: true,
		fetched_url: summaryUrl,
		data: {
			exists: true,
			page_url: summary.content_urls?.desktop?.page ?? null,
			extract_length: extractLength,
			is_substantive: isSubstantive,
			last_edited: summary.timestamp ?? null,
			months_since_edit: monthsSinceEdit !== null ? Math.round(monthsSinceEdit * 10) / 10 : null,
			is_fresh: isFresh,
			is_authoritative: isAuthoritative,
			has_thumbnail: !!summary.thumbnail?.source,
		},
	};
}
