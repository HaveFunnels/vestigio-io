// ──────────────────────────────────────────────
// Shopify HMAC verification helpers.
//
// Lives outside the route file so Next.js 15's strict route-file
// export rule doesn't fail typegen — only HTTP method handlers +
// config flags are allowed as named exports from app/.../route.ts.
//
// Both helpers are pure crypto: no DB, no I/O. Imported by the
// webhook + oauth-callback routes AND by tests/shopify-adapter.test.ts.
// ──────────────────────────────────────────────

import crypto from "node:crypto";

/**
 * Verify Shopify webhook signature.
 *
 * Shopify signs the raw request body with HMAC-SHA256 and sends the
 * base64-encoded digest in the X-Shopify-Hmac-Sha256 header. The
 * signing key is the app's shared secret. Comparison must be
 * timing-safe to avoid signature-leak side channels.
 */
export function verifyShopifySignature(
	rawBody: string,
	sigHeader: string | null,
	secret: string,
): { valid: boolean; error?: string } {
	if (!secret) return { valid: false, error: "webhook_secret_not_configured" };
	if (!sigHeader) return { valid: false, error: "missing_signature" };

	const expected = crypto
		.createHmac("sha256", secret)
		.update(rawBody, "utf8")
		.digest("base64");

	try {
		const a = Buffer.from(expected, "base64");
		const b = Buffer.from(sigHeader, "base64");
		if (a.length !== b.length) return { valid: false, error: "signature_mismatch" };
		return crypto.timingSafeEqual(a, b)
			? { valid: true }
			: { valid: false, error: "signature_mismatch" };
	} catch {
		return { valid: false, error: "signature_decode_failed" };
	}
}

/**
 * Verify the HMAC query parameter Shopify attaches to the OAuth
 * callback redirect.
 *
 * Algorithm:
 *   - Take every query param EXCEPT `hmac` and `signature`
 *   - Sort by key, join `key=value` pairs with `&`
 *   - HMAC-SHA256 the result with client secret
 *   - Compare to the `hmac` param (hex) using timing-safe equality
 */
export function verifyShopifyCallbackHmac(
	searchParams: URLSearchParams,
	secret: string,
): boolean {
	if (!secret) return false;
	const hmacFromShopify = searchParams.get("hmac");
	if (!hmacFromShopify) return false;

	const entries: [string, string][] = [];
	searchParams.forEach((value, key) => {
		if (key === "hmac" || key === "signature") return;
		entries.push([key, value]);
	});
	entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

	const message = entries.map(([k, v]) => `${k}=${v}`).join("&");

	const expected = crypto
		.createHmac("sha256", secret)
		.update(message, "utf8")
		.digest("hex");

	try {
		const a = Buffer.from(expected, "hex");
		const b = Buffer.from(hmacFromShopify, "hex");
		if (a.length !== b.length) return false;
		return crypto.timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
