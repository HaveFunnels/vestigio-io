import { unreachable, type ReconResult } from "./types";
import { fetchDdg } from "./ddg-serp";

// ──────────────────────────────────────────────
// Reclame Aqui via DDG site:reclameaqui.com.br search — Wave 12
//
// Reclame Aqui is the canonical BR consumer-complaint platform. We do
// NOT scrape their HTML directly because:
//   - The page is a React SPA — raw fetch returns a shell with no data
//   - Cloudflare protection regularly returns 403 to non-browser UAs
//   - They have no public API (or it's enterprise-paid)
//
// Solution: same as Reddit. Run `site:reclameaqui.com.br "<brand>"` via
// DDG and read the SERP snippets. Google/DDG crawlers execute the JS
// so the snippets contain the post-render data we need:
//   - reputation label (RA1000, Bom, Regular, Ruim, Não recomendada)
//   - resolution index (e.g. "7.2/10" or "78%")
//   - complaint count (sometimes)
//
// We extract what's available from the snippets and accept that the
// data is shallower than direct scraping would be. The crucial signal
// — "Reclame Aqui flags this brand as critical" — is still detectable
// because the reputation badge is always in the page title or first
// snippet line.
// ──────────────────────────────────────────────

const REPUTATION_LABELS = [
	"RA1000",
	"Ótimo",
	"Bom",
	"Regular",
	"Ruim",
	"Não recomendada",
	"Sem reputação",
] as const;

function extractReputationLabelFromText(text: string): string | null {
	for (const lbl of REPUTATION_LABELS) {
		const escaped = lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`\\b${escaped}\\b`, "i");
		if (re.test(text)) return lbl;
	}
	return null;
}

function extractResolutionIndex(text: string): number | null {
	// Common patterns we see in RA SERP snippets:
	//   "Índice de Solução: 7.2"
	//   "Resolveu 7.8 de 10"
	//   "78% das reclamações"  — convert to /10
	const decimalMatch = text.match(/(?:Índice|Solução|score)[^0-9]{0,30}(\d+(?:[.,]\d+)?)/i);
	if (decimalMatch) {
		const n = parseFloat(decimalMatch[1].replace(",", "."));
		if (!isNaN(n) && n <= 10) return Math.round(n * 10) / 10;
	}
	const pctMatch = text.match(/(\d{1,3})\s*%[^0-9]{0,20}(?:reclamações|resolvi|resoluç)/i);
	if (pctMatch) {
		const n = parseInt(pctMatch[1], 10);
		if (!isNaN(n) && n <= 100) return Math.round(n / 10);
	}
	return null;
}

function extractComplaintCount(text: string): number | null {
	// "X reclamações" patterns — heuristic on text near the number.
	const match = text.match(/(\d{1,5})\s*reclamaç(?:ões|ao)/i);
	if (match) {
		const n = parseInt(match[1], 10);
		if (!isNaN(n) && n < 100_000) return n;
	}
	return null;
}

export async function scrapeReclameAqui(brand: string): Promise<ReconResult> {
	const query = `site:reclameaqui.com.br "${brand}"`;
	const fetchedUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

	const serp = await fetchDdg(query);
	if (!serp) return unreachable(fetchedUrl, "http_error");

	// Filter to actual Reclame Aqui company-page results. They look like:
	//   reclameaqui.com.br/empresa/<slug>/
	//   reclameaqui.com.br/empresa/<slug>/?...
	const raHits = serp.results.filter((r) =>
		r.domain.endsWith("reclameaqui.com.br") &&
		/\/empresa\/[a-z0-9-]+\/?/i.test(r.url),
	);

	if (raHits.length === 0) {
		return {
			reachable: true,
			fetched_url: fetchedUrl,
			data: { listed: false, reason: "no_reclame_aqui_profile_in_serp" },
		};
	}

	// Take the first result (highest relevance) — that's the brand's
	// canonical RA page. Combine title + snippet for signal extraction.
	const top = raHits[0];
	const corpus = `${top.title}\n${top.snippet}`;
	const reputation_label = extractReputationLabelFromText(corpus);
	const resolution_index = extractResolutionIndex(corpus);
	const complaints_total = extractComplaintCount(corpus);

	return {
		reachable: true,
		fetched_url: fetchedUrl,
		data: {
			listed: true,
			fetched_via: "ddg_site_search",
			company_page_url: top.url,
			reputation_label,
			resolution_index,
			complaints_last_6mo: null, // not reliably available in SERP snippets
			complaints_total,
			snippet_excerpt: corpus.slice(0, 300),
		},
	};
}
