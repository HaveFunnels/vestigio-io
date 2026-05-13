import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// Trustpilot HTML scraper — Wave 12
//
// Zero-cost. Trustpilot's public reviews page (/review/<domain>) is
// fully server-rendered HTML — no JS gate, no auth. They embed the
// review payload as application/ld+json structured data inside a
// <script> tag, which is far more stable than parsing the visible
// markup.
//
// We extract:
//   - aggregate rating (1-5 stars)
//   - review count (total)
//   - recent reviews (last 20-ish on page 1) with:
//       - date
//       - rating
//       - title + body
//       - owner_responded flag (look for "Reply from <brand>" marker)
//
// The inference layer aggregates these into:
//   - unanswered_complaint_cluster (multiple 1-2★ reviews unanswered)
//   - negative_velocity_spike (recent negative reviews > baseline)
//   - review_response_silence (>50% reviews unanswered)
// ──────────────────────────────────────────────

interface TrustpilotReview {
	date: string;
	rating: number;
	title: string;
	body: string;
	owner_responded: boolean;
}

interface TrustpilotData {
	rating: number | null;
	review_count: number;
	reviews: TrustpilotReview[];
	parsed_count: number;
	owner_response_rate: number;
	negative_count: number;
	negative_unanswered_count: number;
}

/** Best-effort extraction of the embedded JSON-LD review schema. */
function parseJsonLd(html: string): unknown | null {
	const re =
		/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
	for (const m of html.matchAll(re)) {
		const raw = m[1].trim();
		try {
			const parsed = JSON.parse(raw);
			// Trustpilot uses an array sometimes, a single object other
			// times. We want the LocalBusiness / Organization with
			// aggregateRating.
			const candidates = Array.isArray(parsed) ? parsed : [parsed];
			for (const c of candidates) {
				if (c && c.aggregateRating) return c;
			}
		} catch {
			// next block
		}
	}
	return null;
}

function parseRecentReviews(html: string): TrustpilotReview[] {
	// Trustpilot review cards: each contains an aria-label that
	// includes the star rating, a <time> for the date, and the body
	// inside a paragraph with class containing "typography_body".
	// Owner replies appear in a separate block with "Reply from".
	const reviews: TrustpilotReview[] = [];

	// Split by review-article boundaries — they use data-service-review-card-paper.
	const cardRe =
		/<article[^>]+data-service-review-card-paper[\s\S]*?<\/article>/gi;
	const cards = html.match(cardRe) || [];

	for (const card of cards.slice(0, 30)) {
		const rating =
			parseInt(
				card.match(/data-service-review-rating="(\d)"/)?.[1] ??
					card.match(/aria-label="Rated (\d) out of/i)?.[1] ??
					"0",
				10,
			) || 0;

		const dateMatch = card.match(/datetime="([^"]+)"/);
		const date = dateMatch ? dateMatch[1] : "";

		const titleMatch = card.match(
			/<h2[^>]+data-service-review-title-typography[^>]*>([\s\S]*?)<\/h2>/i,
		);
		const title = stripTags(titleMatch?.[1] ?? "").trim().slice(0, 120);

		const bodyMatch = card.match(
			/<p[^>]+data-service-review-text-typography[^>]*>([\s\S]*?)<\/p>/i,
		);
		const body = stripTags(bodyMatch?.[1] ?? "").trim().slice(0, 400);

		// Owner reply: look for the brand reply block inside the card.
		const owner_responded =
			/data-service-review-business-reply/i.test(card) ||
			/<h3[^>]*>Reply from /i.test(card);

		if (rating > 0) {
			reviews.push({ date, rating, title, body, owner_responded });
		}
	}

	return reviews;
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

export async function scrapeTrustpilot(
	_brand: string,
	rootDomain: string,
): Promise<ReconResult> {
	const slug = rootDomain.replace(/^www\./, "");
	const url = `https://www.trustpilot.com/review/${encodeURIComponent(slug)}`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");
	if (res.status === 404) {
		return {
			reachable: true,
			fetched_url: url,
			data: { listed: false, reason: "no_trustpilot_profile" },
		};
	}
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });

	const html = await res.text();
	const jsonLd = parseJsonLd(html) as
		| {
				aggregateRating?: { ratingValue?: number; reviewCount?: number };
		  }
		| null;

	const reviews = parseRecentReviews(html);
	const rating = jsonLd?.aggregateRating?.ratingValue ?? null;
	const review_count = jsonLd?.aggregateRating?.reviewCount ?? reviews.length;

	const negative = reviews.filter((r) => r.rating <= 2);
	const negative_unanswered = negative.filter((r) => !r.owner_responded);
	const owner_response_rate =
		reviews.length > 0
			? reviews.filter((r) => r.owner_responded).length / reviews.length
			: 0;

	const data: TrustpilotData = {
		rating,
		review_count,
		reviews: reviews.slice(0, 20),
		parsed_count: reviews.length,
		owner_response_rate,
		negative_count: negative.length,
		negative_unanswered_count: negative_unanswered.length,
	};

	return {
		reachable: true,
		fetched_url: url,
		data: { listed: true, ...data },
	};
}
