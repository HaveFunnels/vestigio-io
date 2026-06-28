// ──────────────────────────────────────────────
// Edge-runtime-safe verifier for the strategy-plan export token.
//
// Mirrors [[strategy-export-token]] but uses the Web Crypto API
// (globalThis.crypto.subtle) instead of Node's `crypto`, because
// middleware.ts runs on the Edge runtime where Node built-ins are
// unavailable.
//
// Used to admit puppeteer's PDF-export request at the middleware
// layer (otherwise withAuth would redirect the cookie-less chromium
// to /auth/signin and the captured PDF would be a black login page).
//
// Security: end-to-end cryptographic verification — signature +
// planId-binding + expiry — performed against NEXTAUTH_SECRET. No
// trust placed in Host headers or other spoofable request fields.
// The token's 90-second TTL bounds the blast radius of a leaked
// token to the single planId it was minted for.
// ──────────────────────────────────────────────

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;
	const secret = process.env.NEXTAUTH_SECRET;
	if (!secret) throw new Error("NEXTAUTH_SECRET is required to verify export tokens");
	cachedKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	return cachedKey;
}

function hexToBytes(hex: string): Uint8Array | null {
	if (hex.length === 0 || hex.length % 2 !== 0) return null;
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		const hi = hex.charCodeAt(i);
		const lo = hex.charCodeAt(i + 1);
		const a = hi >= 48 && hi <= 57 ? hi - 48 : hi >= 97 && hi <= 102 ? hi - 87 : hi >= 65 && hi <= 70 ? hi - 55 : -1;
		const b = lo >= 48 && lo <= 57 ? lo - 48 : lo >= 97 && lo <= 102 ? lo - 87 : lo >= 65 && lo <= 70 ? lo - 55 : -1;
		if (a < 0 || b < 0) return null;
		out[i / 2] = (a << 4) | b;
	}
	return out;
}

/**
 * Verify a strategy-export token end-to-end. Returns the bound
 * planId on success, or null on any failure (malformed, expired,
 * forged signature, or NEXTAUTH_SECRET missing).
 *
 * crypto.subtle.verify is the constant-time primitive — callers
 * don't need to implement their own timing-safe comparison.
 */
export async function verifyExportTokenEdge(token: string | null): Promise<{ planId: string } | null> {
	if (!token) return null;
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [planId, expiresAtStr, sigHex] = parts;
	if (!planId) return null;
	const expiresAt = parseInt(expiresAtStr, 10);
	if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
	const sig = hexToBytes(sigHex);
	if (!sig) return null;
	try {
		const key = await getKey();
		const ok = await crypto.subtle.verify(
			"HMAC",
			key,
			sig as BufferSource,
			new TextEncoder().encode(`${planId}.${expiresAt}`),
		);
		return ok ? { planId } : null;
	} catch {
		return null;
	}
}
