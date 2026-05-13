import { reconFetch, unreachable, type ReconResult, RECON_FETCH_TIMEOUT_MS } from "./types";

// ──────────────────────────────────────────────
// Reddit API — Wave 12 (gated on env vars)
//
// Zero-cost. Reddit's free API uses OAuth client_credentials flow
// (machine-to-machine). Once we have a token we can hit
// oauth.reddit.com/r/all/search?q=<brand> for full-text search across
// all public subreddits.
//
// Required env vars (user generates and provides):
//   REDDIT_CLIENT_ID
//   REDDIT_CLIENT_SECRET
//
// Without them, this fetcher returns reachable=false with
// error_kind='auth_missing'. The inference layer treats that as
// "feature disabled — no findings" rather than as a real silence
// signal.
//
// Cache: tokens last 24h. We cache in-process to avoid hitting Reddit
// for a fresh token on every audit. Module-level Map is fine because
// the cron pass runs in the same Node process.
// ──────────────────────────────────────────────

let cachedToken: { value: string; expires_at: number } | null = null;

async function getRedditToken(): Promise<string | null> {
	const clientId = process.env.REDDIT_CLIENT_ID;
	const clientSecret = process.env.REDDIT_CLIENT_SECRET;
	if (!clientId || !clientSecret) return null;

	const now = Date.now();
	if (cachedToken && cachedToken.expires_at > now + 60_000) {
		return cachedToken.value;
	}

	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), RECON_FETCH_TIMEOUT_MS);

	try {
		const res = await fetch("https://www.reddit.com/api/v1/access_token", {
			method: "POST",
			signal: controller.signal,
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "VestigioBrandEcho/1.0",
			},
			body: "grant_type=client_credentials",
		});
		clearTimeout(timer);
		if (!res.ok) return null;
		const body = (await res.json()) as {
			access_token?: string;
			expires_in?: number;
		};
		if (!body.access_token) return null;
		cachedToken = {
			value: body.access_token,
			expires_at: now + (body.expires_in ?? 3600) * 1000,
		};
		return body.access_token;
	} catch {
		clearTimeout(timer);
		return null;
	}
}

interface RedditHit {
	id: string;
	title: string;
	subreddit: string;
	score: number;
	num_comments: number;
	created_utc: number;
	permalink: string;
	url: string;
	selftext_excerpt: string;
}

export async function queryReddit(brand: string): Promise<ReconResult> {
	const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(brand)}&limit=25&sort=relevance&type=link`;

	const token = await getRedditToken();
	if (!token) {
		return unreachable(url, "auth_missing", {
			note: "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET env vars not configured",
		});
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), RECON_FETCH_TIMEOUT_MS);
	let res: Response;
	try {
		res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "VestigioBrandEcho/1.0",
			},
		});
	} catch {
		clearTimeout(timer);
		return unreachable(url, "timeout");
	}
	clearTimeout(timer);

	if (res.status === 429) return unreachable(url, "rate_limited");
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });

	let body: {
		data?: {
			children?: Array<{
				data?: {
					id?: string;
					title?: string;
					subreddit?: string;
					score?: number;
					num_comments?: number;
					created_utc?: number;
					permalink?: string;
					url?: string;
					selftext?: string;
				};
			}>;
		};
	};
	try {
		body = await res.json();
	} catch {
		return unreachable(url, "parse_error");
	}

	const hits: RedditHit[] = (body.data?.children ?? [])
		.map((c) => c.data)
		.filter(
			(d): d is NonNullable<typeof d> => !!d && !!d.id && !!d.title,
		)
		.map((d) => ({
			id: d.id!,
			title: d.title!,
			subreddit: d.subreddit ?? "",
			score: d.score ?? 0,
			num_comments: d.num_comments ?? 0,
			created_utc: d.created_utc ?? 0,
			permalink: d.permalink ?? "",
			url: d.url ?? "",
			selftext_excerpt: (d.selftext ?? "").slice(0, 240),
		}));

	// Bucket hits to power inference signals later.
	const questionThreads = hits.filter(
		(h) =>
			/\?$/.test(h.title) ||
			/^(best|recommend|alternative|vs |which |what)/i.test(h.title),
	);
	const versusMentions = hits.filter((h) =>
		/\b(vs|versus|alternative to|compared)\b/i.test(h.title),
	);
	const subreddits = Array.from(new Set(hits.map((h) => h.subreddit))).slice(
		0,
		10,
	);

	return {
		reachable: true,
		fetched_url: url,
		data: {
			query: brand,
			total_hits: hits.length,
			question_thread_count: questionThreads.length,
			versus_mention_count: versusMentions.length,
			subreddits,
			top_question_threads: questionThreads.slice(0, 5).map((h) => ({
				id: h.id,
				title: h.title,
				subreddit: h.subreddit,
				score: h.score,
				comments: h.num_comments,
				permalink: h.permalink,
			})),
			top_versus_threads: versusMentions.slice(0, 5).map((h) => ({
				id: h.id,
				title: h.title,
				subreddit: h.subreddit,
				score: h.score,
				permalink: h.permalink,
			})),
		},
	};
}
