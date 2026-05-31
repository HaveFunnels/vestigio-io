import * as https from "node:https";
import type { SerpProvider, SerpQueryResult, SerpResultItem } from "./types";

// ──────────────────────────────────────────────
// Brave Search API adapter — Wave 25
//
// Docs: https://api.search.brave.com/app/documentation/web-search/get-started
//
// Free tier: 2000 queries/month, 1 query/second. The 1 qps limit is
// enforced server-side (returns 429); the enrichment pass paces its
// loop with a small sleep between queries to stay under it without
// retries.
//
// We pull only what we need:
//   - web.results[] (organic) → SerpResultItem[]
//   - query.is_navigational  → branded-search detection
//   - related queries        → keyword expansion seeds (Wave 26)
//
// Brave's web.results don't carry an explicit "is_paid" flag — the
// ads layer is separate (and not in the free tier). We treat every
// item from web.results as organic.
// ──────────────────────────────────────────────

const BRAVE_HOST = "api.search.brave.com";
const BRAVE_PATH = "/res/v1/web/search";
const TIMEOUT_MS = 8_000;
const PROVIDER_NAME = "brave_search";

interface BraveWebResult {
	title?: string;
	url?: string;
	description?: string;
	meta_url?: { hostname?: string };
}

interface BraveSearchResponse {
	query?: {
		original?: string;
		is_navigational?: boolean;
	};
	web?: {
		results?: BraveWebResult[];
		total?: number;
	};
	mixed?: { main?: Array<{ type: string; index?: number }> };
	related?: { results?: Array<{ query?: string; text?: string }> };
}

function hostFromUrl(rawUrl: string | undefined): string {
	if (!rawUrl) return "";
	try {
		const u = new URL(rawUrl);
		// Strip leading "www." — competitor matching is on apex.
		return u.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return "";
	}
}

function localeToBrave(locale: string | undefined): {
	country: string;
	search_lang: string;
	ui_lang: string;
} {
	const norm = (locale || "en").toLowerCase();
	if (norm.startsWith("pt"))
		return { country: "BR", search_lang: "pt", ui_lang: "pt-BR" };
	if (norm.startsWith("es"))
		return { country: "ES", search_lang: "es", ui_lang: "es-ES" };
	if (norm.startsWith("de"))
		return { country: "DE", search_lang: "de", ui_lang: "de-DE" };
	return { country: "US", search_lang: "en", ui_lang: "en-US" };
}

function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const req = https.get(url, { headers, timeout: TIMEOUT_MS }, (res) => {
			const status = res.statusCode || 0;
			const chunks: Buffer[] = [];
			res.on("data", (c: Buffer) => chunks.push(c));
			res.on("end", () => {
				const body = Buffer.concat(chunks).toString("utf-8");
				if (status >= 200 && status < 300) {
					try {
						resolve(JSON.parse(body));
					} catch (err) {
						reject(new Error(`brave: invalid JSON response (${status})`));
					}
				} else {
					reject(new Error(`brave: HTTP ${status}: ${body.slice(0, 200)}`));
				}
			});
			res.on("error", reject);
		});
		req.on("error", reject);
		req.on("timeout", () => {
			req.destroy();
			reject(new Error("brave: timeout"));
		});
	});
}

export class BraveSearchProvider implements SerpProvider {
	readonly name = PROVIDER_NAME;
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async search(opts: {
		query: string;
		locale?: string;
		count?: number;
	}): Promise<SerpQueryResult | null> {
		const { query } = opts;
		if (!query || query.trim().length === 0) return null;
		const { country, search_lang, ui_lang } = localeToBrave(opts.locale);
		const count = Math.min(opts.count ?? 10, 20);
		const url = new URL(`https://${BRAVE_HOST}${BRAVE_PATH}`);
		url.searchParams.set("q", query);
		url.searchParams.set("country", country);
		url.searchParams.set("search_lang", search_lang);
		url.searchParams.set("ui_lang", ui_lang);
		url.searchParams.set("count", String(count));
		url.searchParams.set("safesearch", "moderate");
		url.searchParams.set("text_decorations", "false");
		url.searchParams.set("spellcheck", "false");

		let data: BraveSearchResponse;
		try {
			data = (await fetchJson(url.toString(), {
				Accept: "application/json",
				"X-Subscription-Token": this.apiKey,
			})) as BraveSearchResponse;
		} catch (err) {
			console.warn(
				`[brave-search] query="${query}" failed:`,
				err instanceof Error ? err.message : err,
			);
			return null;
		}

		const items: SerpResultItem[] = (data.web?.results || []).map(
			(r, idx) => ({
				rank: idx + 1,
				url: r.url || "",
				host: r.meta_url?.hostname
					? r.meta_url.hostname.replace(/^www\./, "").toLowerCase()
					: hostFromUrl(r.url),
				title: r.title || "",
				snippet: r.description || "",
				is_paid: false,
			}),
		);
		const related: string[] = (data.related?.results || [])
			.map((r) => r.query || r.text || "")
			.filter((q) => q.length > 0)
			.slice(0, 10);

		return {
			provider: PROVIDER_NAME,
			query,
			locale: opts.locale || "en",
			fetched_at: new Date().toISOString(),
			is_navigational: !!data.query?.is_navigational,
			results: items,
			related,
			total_results: data.web?.total ?? items.length,
			from_cache: false,
		};
	}
}

export function tryCreateBraveSearchProvider(): SerpProvider | null {
	const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
	if (!key) return null;
	return new BraveSearchProvider(key);
}
