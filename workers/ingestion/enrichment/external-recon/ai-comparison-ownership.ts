import { unreachable, type ReconResult } from "./types";
import { fetchDdg } from "./ddg-serp";

// ──────────────────────────────────────────────
// AI Comparison Ownership probe — Wave 13 AI Visibility
//
// Buyers about to choose between vendors run "<brand> vs <competitor>"
// queries — and AI assistants surface answers based on whoever owns the
// comparison narrative. If competitors publish your-brand-vs-them pages
// and you don't have the reverse, the AI cites THEM, with their framing.
//
// We probe two angles via DDG:
//
//   1) "<brand> vs"  — what does the open-ended "vs" SERP look like?
//      Captures who's listed as comparable AND whether brand's own
//      domain surfaces in top results.
//
//   2) "<brand> alternatives"  — already covered by serp_category_intent
//      but with a different intent dimension. We re-run with explicit
//      "alternatives" suffix to detect alternative-magnet status.
//
// Zero cost. Uses the existing DDG scraper.
// ──────────────────────────────────────────────

interface ComparisonHit {
	domain: string;
	url: string;
	title: string;
	rank: number;
}

const DDG_BASE = "https://html.duckduckgo.com/html/";

export async function probeAiComparisonOwnership(
	brand: string,
	rootDomain: string,
): Promise<ReconResult> {
	const ownDomain = rootDomain.replace(/^www\./, "").toLowerCase();
	const query = `${brand} vs`;
	const url = `${DDG_BASE}?q=${encodeURIComponent(query)}&kl=us-en`;
	const serp = await fetchDdg(query);
	if (!serp) return unreachable(url, "http_error");

	// Hits where the title or URL contains "vs <competitor>" — those are
	// canonical comparison pages.
	const versusHits: ComparisonHit[] = serp.results
		.filter((r) => /\bvs\b/i.test(r.title) || /\bvs\b|\bcomparison\b|\balternatives?\b/i.test(r.url))
		.map((r) => ({
			domain: r.domain,
			url: r.url,
			title: r.title.slice(0, 120),
			rank: r.rank,
		}));

	const ownVersusHit = versusHits.find(
		(h) => h.domain === ownDomain || h.domain.endsWith(`.${ownDomain}`),
	);
	const ownOwnsVsQuery = !!ownVersusHit && ownVersusHit.rank <= 3;

	// Mentions of competitor names = pull them out of the title.
	// Heuristic: in "Brand vs Competitor — Foo", split on "vs" and take
	// the immediate next token group.
	const competitorTokens = new Set<string>();
	for (const hit of versusHits.slice(0, 8)) {
		const m = hit.title.match(/\bvs\.?\s+([A-Z][A-Za-z0-9]{2,40}(?:\s[A-Z][A-Za-z0-9]+)?)/);
		if (m && m[1]) competitorTokens.add(m[1].trim());
	}

	// Top competitor domains that DON'T include our own — these are the
	// authors of "<brand> vs them" pages we don't own.
	const competitorDomainsOwningVs = Array.from(
		new Set(
			versusHits
				.filter((h) => !h.domain.includes(ownDomain))
				.map((h) => h.domain),
		),
	).slice(0, 8);

	return {
		reachable: true,
		fetched_url: url,
		data: {
			query,
			versus_hit_count: versusHits.length,
			own_owns_vs_query: ownOwnsVsQuery,
			own_vs_rank: ownVersusHit?.rank ?? null,
			competitor_tokens_mentioned: Array.from(competitorTokens).slice(0, 6),
			competitor_domains_owning_vs: competitorDomainsOwningVs,
			top_vs_titles: versusHits.slice(0, 5).map((h) => h.title),
		},
	};
}
