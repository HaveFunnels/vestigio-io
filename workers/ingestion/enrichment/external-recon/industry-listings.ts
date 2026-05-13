import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// Industry Listings probe — Wave 12
//
// Detects whether the brand has a listing on the major industry
// directories: G2, Capterra, Product Hunt, Wikipedia. Each is a
// simple presence check (HTTP HEAD, follow redirects, treat 2xx +
// 200-byte body as "exists" — Capterra/G2 return soft-404s for
// missing products on the /p/<brand> route).
//
// Returns an array of 4 ReconResults, one per directory. Ordered to
// match external-recon.ts source slots:
//   [G2, Capterra, Product Hunt, Wikipedia]
// ──────────────────────────────────────────────

async function probeG2(brand: string): Promise<ReconResult> {
	// G2 product slug = brand. They return 200 even for non-existent
	// products (template page), so we check the page body for the
	// brand name in a product-header context.
	const url = `https://www.g2.com/products/${encodeURIComponent(brand)}/reviews`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");
	if (res.status === 404) {
		return { reachable: true, fetched_url: url, data: { listed: false } };
	}
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });
	const html = await res.text();
	// G2 inserts the brand in <h1> on real product pages; a generic
	// fallback page won't. Cheap heuristic that's resilient to template
	// changes.
	const listed = /<h1[^>]*>[^<]*\b/.test(html) &&
		new RegExp(`\\b${brand}\\b`, "i").test(html.slice(0, 5_000));
	return {
		reachable: true,
		fetched_url: url,
		data: {
			listed,
			html_size: html.length,
		},
	};
}

async function probeCapterra(brand: string): Promise<ReconResult> {
	// Capterra uses /p/<numeric-id>/<brand>; without the id we can't
	// hit the canonical URL directly. Use their search endpoint
	// instead — returns JSON-ish for queries (they gate ?o= but the
	// HTML route works).
	const url = `https://www.capterra.com/search/?search=${encodeURIComponent(brand)}`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });
	const html = await res.text();
	// Capterra's search results page mentions the brand inside a
	// product card if there's a match. We look for both the brand
	// token AND a "product card" anchor pattern.
	const brandRegex = new RegExp(`\\b${brand}\\b`, "i");
	const hasProductCard = /class="[^"]*product[^"]*"/i.test(html);
	const listed = brandRegex.test(html) && hasProductCard;
	return {
		reachable: true,
		fetched_url: url,
		data: { listed, html_size: html.length },
	};
}

async function probeProductHunt(brand: string): Promise<ReconResult> {
	// Product Hunt slug = brand. Their pages 404 cleanly when product
	// doesn't exist, so a simple HEAD is enough.
	const url = `https://www.producthunt.com/products/${encodeURIComponent(brand)}`;
	const res = await reconFetch(url, { method: "GET" });
	if (!res) return unreachable(url, "timeout");
	// PH returns 200 with a redirect to /not-found for non-existent
	// products. Check final URL.
	const listed = res.ok && !res.url.includes("/not-found");
	return {
		reachable: true,
		fetched_url: url,
		data: { listed, final_url: res.url, status: res.status },
	};
}

async function probeWikipedia(brand: string): Promise<ReconResult> {
	// Wikipedia's public REST API returns 200+article for existing
	// pages, 404 for missing. No auth, no rate limit at our scale.
	const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(brand)}`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");
	if (res.status === 404) {
		return { reachable: true, fetched_url: url, data: { listed: false } };
	}
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });
	try {
		const body = (await res.json()) as {
			type?: string;
			extract?: string;
			thumbnail?: { source?: string };
		};
		// "disambiguation" or "missingtitle" types are not a real listing
		const isRealArticle =
			body.type === "standard" || body.type === undefined;
		return {
			reachable: true,
			fetched_url: url,
			data: {
				listed: isRealArticle,
				type: body.type ?? null,
				has_extract: !!body.extract,
				has_thumbnail: !!body.thumbnail?.source,
			},
		};
	} catch {
		return unreachable(url, "parse_error");
	}
}

export async function probeIndustryListings(brand: string): Promise<ReconResult[]> {
	const probes = await Promise.allSettled([
		probeG2(brand),
		probeCapterra(brand),
		probeProductHunt(brand),
		probeWikipedia(brand),
	]);
	return probes.map((p, i) => {
		if (p.status === "fulfilled") return p.value;
		const urls = [
			`https://www.g2.com/products/${brand}/reviews`,
			`https://www.capterra.com/search/?search=${brand}`,
			`https://www.producthunt.com/products/${brand}`,
			`https://en.wikipedia.org/api/rest_v1/page/summary/${brand}`,
		];
		return unreachable(urls[i], "unknown", {
			reason: p.reason instanceof Error ? p.reason.message : String(p.reason),
		});
	});
}
