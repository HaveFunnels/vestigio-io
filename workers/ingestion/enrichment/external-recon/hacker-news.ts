import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// Hacker News Algolia search — Wave 12
//
// Zero-cost, no auth. HN's full-text search is provided by Algolia at
// hn.algolia.com/api/v1/search?query=<q>. Free to call, returns JSON.
//
// For B2B SaaS customers (havefunnels-like), HN signal is meaningful:
//   - Mentioned in launch posts? → "Show HN" momentum signal
//   - Mentioned in comments? → tech audience adoption signal
//   - Sentiment in comments → reputation tail
//
// We collect:
//   - top 20 most relevant stories/comments mentioning the brand
//   - story types (story | comment)
//   - average points + comments
//   - latest mention date
//
// Inferences:
//   - brand_pain_pattern (negative comment cluster)
//   - competitor_advocacy_pattern (mentions in "X vs your brand" threads)
//   - tech_audience_silence (zero mentions for SaaS = invisible to early adopters)
// ──────────────────────────────────────────────

interface HnHit {
	objectID: string;
	title?: string | null;
	story_text?: string | null;
	comment_text?: string | null;
	url?: string | null;
	author?: string | null;
	points?: number | null;
	num_comments?: number | null;
	created_at?: string | null;
	_tags?: string[];
}

interface HnSearchResponse {
	hits?: HnHit[];
	nbHits?: number;
	processingTimeMS?: number;
}

export async function scrapeHackerNews(brand: string): Promise<ReconResult> {
	// Quote the brand so multi-word brands match as a phrase.
	const q = brand.includes(" ") ? `"${brand}"` : brand;
	const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=20`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });

	let body: HnSearchResponse;
	try {
		body = (await res.json()) as HnSearchResponse;
	} catch {
		return unreachable(url, "parse_error");
	}

	const hits = body.hits ?? [];
	const stories = hits.filter((h) => h._tags?.includes("story"));
	const comments = hits.filter((h) => h._tags?.includes("comment"));
	const showHn = hits.filter((h) =>
		(h.title ?? "").toLowerCase().startsWith("show hn"),
	);

	const totalPoints = stories.reduce((s, h) => s + (h.points ?? 0), 0);
	const totalComments = stories.reduce((s, h) => s + (h.num_comments ?? 0), 0);
	const latestDate = hits
		.map((h) => h.created_at)
		.filter(Boolean)
		.sort()
		.at(-1) ?? null;

	return {
		reachable: true,
		fetched_url: url,
		data: {
			query: q,
			total_hits: body.nbHits ?? hits.length,
			parsed_hits: hits.length,
			story_count: stories.length,
			comment_count: comments.length,
			show_hn_count: showHn.length,
			total_story_points: totalPoints,
			total_story_comments: totalComments,
			latest_mention_date: latestDate,
			// Surface the top 5 most-points stories so the LLM enrichment
			// step (later) can sentiment-classify them.
			top_stories: stories
				.slice()
				.sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
				.slice(0, 5)
				.map((h) => ({
					id: h.objectID,
					title: h.title ?? null,
					url: h.url ?? null,
					points: h.points ?? 0,
					comments: h.num_comments ?? 0,
					created_at: h.created_at ?? null,
				})),
			// Top 5 comments for sentiment pulse.
			top_comments: comments.slice(0, 5).map((h) => ({
				id: h.objectID,
				excerpt: (h.comment_text ?? "").slice(0, 240),
				author: h.author ?? null,
				created_at: h.created_at ?? null,
			})),
		},
	};
}
