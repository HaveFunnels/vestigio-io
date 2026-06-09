// ──────────────────────────────────────────────
// URL templating — Wire 1 (network-as-surface)
//
// Collapses id-shaped path segments into `{id}` so semantically
// equivalent URLs hit the same NetworkSurface row. The cycle's first
// observation of any (env, template, method) lands as the canonical
// surface; subsequent cycles bump capturedCount and lastSeenCycleRef
// instead of fragmenting into per-instance rows.
//
// What counts as "id-shaped":
//   - Pure digits           e.g. /products/12345        → /products/{id}
//   - UUID v1-v5            e.g. /orders/<8-4-4-4-12>   → /orders/{id}
//   - Prisma-style cuid     e.g. /carts/cl_a1b2…        → /carts/{id}
//                                  /carts/cm…           → /carts/{id}
//   - Stripe-style prefix_  e.g. /charges/ch_xxxx       → /charges/{id}
//                                  /sessions/sess_…    → /sessions/{id}
//   - Long alphanumeric IDs (≥ 16 chars, mixed)
//
// What stays as-is:
//   - Word-like segments (cart, product, api, v1, v2, …)
//   - Short single-letter segments (avoid false positives on intentional
//     short URLs like /a/page-shortener-style)
//
// The query string is dropped entirely — different ?id= values would
// fragment surfaces, and per-query analysis lives in the caller's
// payload not the template.
// ──────────────────────────────────────────────

const SEG_PURE_DIGITS = /^\d+$/;
const SEG_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEG_CUID = /^c[a-z0-9]{20,}$/i;
const SEG_PREFIXED_ID = /^[a-z]{2,8}_[a-z0-9]{8,}$/i;
const SEG_LONG_MIXED_HEX = /^[0-9a-f]{16,}$/i;

function isIdShaped(seg: string): boolean {
	if (seg.length < 2) return false;
	if (SEG_PURE_DIGITS.test(seg)) return true;
	if (SEG_UUID.test(seg)) return true;
	if (SEG_CUID.test(seg)) return true;
	if (SEG_PREFIXED_ID.test(seg)) return true;
	if (SEG_LONG_MIXED_HEX.test(seg) && /\d/.test(seg) && /[a-f]/i.test(seg)) {
		return true;
	}
	return false;
}

/**
 * Build a stable URL template suitable as a dedup key for
 * NetworkSurface. Returns "host + path-with-ids-collapsed" without
 * scheme or query string. Falsy URL input returns the raw input
 * unchanged so the caller can decide what to do with it.
 */
export function urlTemplate(url: string): string {
	if (!url) return url;
	try {
		const u = new URL(url);
		const collapsedPath = u.pathname
			.split("/")
			.map((seg) => (isIdShaped(seg) ? "{id}" : seg))
			.join("/");
		return `${u.host}${collapsedPath}`;
	} catch {
		return url;
	}
}
