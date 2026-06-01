import * as https from "node:https";
import type { SerpProvider, SerpQueryResult, SerpResultItem } from "./types";

// ──────────────────────────────────────────────
// Tavily Search API adapter — Wave 25 (cost-optimized path)
//
// Docs: https://docs.tavily.com/docs/rest-api/api-reference
//
// Free tier: 1,000 requests/month. Paid tier: $0.04 / 1k requests
// (≈74x cheaper than Brave's $3/1k extras). At 1k-env audit-daily
// scale, Tavily covers the same workload for cents vs Brave's
// hundreds of dollars.
//
// Trade-off vs Brave: Tavily orders results by AI-relevance score
// rather than Google-style organic rank. We treat its returned
// order as the rank (1-indexed) so the SerpResultItem interface
// stays unchanged — but downstream consumers should treat rank as
// "approximate position" rather than exact Google rank. For
// brand_serp_encroachment / serp_overlap_detected, this is good
// enough: the rules care about "appears in top-N", not "is at
// exact position N".
//
// Tavily does NOT classify queries as navigational. We always set
// is_navigational=false; the brand-intent signal is established by
// the query_intent metadata at the SerpResultsPayload level, not
// by this flag.
// ──────────────────────────────────────────────

const TAVILY_HOST = "api.tavily.com";
const TAVILY_PATH = "/search";
const TIMEOUT_MS = 10_000;
const PROVIDER_NAME = "tavily";

interface TavilyResult {
	title?: string;
	url?: string;
	content?: string;
	score?: number;
}

interface TavilyResponse {
	query?: string;
	follow_up_questions?: string[] | null;
	answer?: string;
	results?: TavilyResult[];
	response_time?: number;
}

function hostFromUrl(rawUrl: string | undefined): string {
	if (!rawUrl) return "";
	try {
		const u = new URL(rawUrl);
		return u.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return "";
	}
}

// Tavily accepts a `country` parameter for locale targeting. Map our
// locale strings to ISO-3166-1 alpha-2 codes Tavily understands.
function localeToCountry(locale: string | undefined): string {
	const norm = (locale || "en").toLowerCase();
	if (norm === "pt-pt") return "portugal";
	if (norm.startsWith("pt")) return "brazil";
	if (norm.startsWith("es")) return "spain";
	if (norm.startsWith("de")) return "germany";
	if (norm.startsWith("fr")) return "france";
	if (norm.startsWith("ja")) return "japan";
	return "united states";
}

function postJson(
	url: string,
	body: string,
	headers: Record<string, string>,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const req = https.request(
			{
				host: parsed.host,
				path: parsed.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
					...headers,
				},
				timeout: TIMEOUT_MS,
			},
			(res) => {
				const status = res.statusCode || 0;
				const chunks: Buffer[] = [];
				res.on("data", (c: Buffer) => chunks.push(c));
				res.on("end", () => {
					const raw = Buffer.concat(chunks).toString("utf-8");
					if (status >= 200 && status < 300) {
						try {
							resolve(JSON.parse(raw));
						} catch {
							reject(new Error(`tavily: invalid JSON response (${status})`));
						}
					} else {
						reject(new Error(`tavily: HTTP ${status}: ${raw.slice(0, 200)}`));
					}
				});
				res.on("error", reject);
			},
		);
		req.on("error", reject);
		req.on("timeout", () => {
			req.destroy();
			reject(new Error("tavily: timeout"));
		});
		req.write(body);
		req.end();
	});
}

export class TavilySearchProvider implements SerpProvider {
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
		const maxResults = Math.min(opts.count ?? 10, 20);
		const country = localeToCountry(opts.locale);

		const body = JSON.stringify({
			api_key: this.apiKey,
			query,
			search_depth: "basic", // basic = 1 credit; advanced = 2 credits
			topic: "general",
			max_results: maxResults,
			include_answer: false,
			include_raw_content: false,
			include_images: false,
			country, // locale targeting
		});

		let data: TavilyResponse;
		try {
			data = (await postJson(`https://${TAVILY_HOST}${TAVILY_PATH}`, body, {})) as TavilyResponse;
		} catch (err) {
			console.warn(
				`[tavily] query="${query}" failed:`,
				err instanceof Error ? err.message : err,
			);
			return null;
		}

		const items: SerpResultItem[] = (data.results || []).map((r, idx) => ({
			rank: idx + 1,
			url: r.url || "",
			host: hostFromUrl(r.url),
			title: r.title || "",
			snippet: r.content || "",
			is_paid: false,
		}));
		const related: string[] = Array.isArray(data.follow_up_questions)
			? data.follow_up_questions.filter((q): q is string => typeof q === "string")
			: [];

		return {
			provider: PROVIDER_NAME,
			query,
			locale: opts.locale || "en",
			fetched_at: new Date().toISOString(),
			is_navigational: false, // Tavily doesn't classify; SerpResultsPayload.query_intent carries the intent metadata
			results: items,
			related,
			total_results: items.length,
			from_cache: false,
		};
	}
}

export function tryCreateTavilyProvider(): SerpProvider | null {
	const key = process.env.TAVILY_API_KEY?.trim();
	if (!key) return null;
	return new TavilySearchProvider(key);
}

// Exposed for tests — exercises the locale → country mapping without
// hitting the network.
export const __testing = {
	localeToCountry,
	hostFromUrl,
};
