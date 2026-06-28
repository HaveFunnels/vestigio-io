import crypto from "crypto";

// ──────────────────────────────────────────────
// Strategy Plan export token (Wave 22.6 Step 10)
//
// Short-lived HMAC binding (planId + expiry). Lets the headless
// chromium that generates the PDF access the print-friendly route
// + the underlying /api/library/strategy/[month] without a session
// cookie. The pool runs in-process with the Next.js app on Railway,
// so the only attack surface is "someone with the secret could
// forge tokens" — same threat model as NEXTAUTH_SECRET.
//
// Token format: <planId>.<expiresAt>.<sig>
// where sig = HMAC-SHA256(secret, planId + '.' + expiresAt)
//
// planId is encoded *into* the token (not just bound by a caller-
// supplied argument) so an Edge middleware verifier can validate
// the token end-to-end without a DB lookup. The page-level
// middleware uses [[strategy-export-token-edge]] to admit requests
// before the page shell renders; without planId in the token,
// middleware would have no way to compute the expected HMAC.
//
// Lifetime: 90 seconds. The PDF render finishes in < 30s on average
// (the dominant cost is page.goto + waitForLoadState, the actual
// page.pdf() is single-digit seconds). 90s is enough headroom for
// a cold worker boot without leaving a long-lived bearer floating
// around.
// ──────────────────────────────────────────────

const TOKEN_TTL_MS = 90 * 1000;

function getSecret(): string {
	const secret = process.env.NEXTAUTH_SECRET;
	if (!secret) throw new Error("NEXTAUTH_SECRET is required to mint export tokens");
	return secret;
}

export function mintExportToken(planId: string): string {
	const expiresAt = Date.now() + TOKEN_TTL_MS;
	const payload = `${planId}.${expiresAt}`;
	const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
	return `${planId}.${expiresAt}.${sig}`;
}

export function verifyExportToken(token: string, planId: string): boolean {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const [tokenPlanId, expiresAtStr, sigHex] = parts;
	if (tokenPlanId !== planId) return false;
	const expiresAt = parseInt(expiresAtStr, 10);
	if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
	const expected = crypto
		.createHmac("sha256", getSecret())
		.update(`${tokenPlanId}.${expiresAt}`)
		.digest("hex");
	try {
		return crypto.timingSafeEqual(
			Buffer.from(sigHex, "hex"),
			Buffer.from(expected, "hex"),
		);
	} catch {
		return false;
	}
}

/**
 * Cheap pre-check used at API entry to reject malformed/expired
 * tokens before any DB lookup. Does NOT verify the HMAC (which
 * needs the matching secret in a constant-time path) — that still
 * happens later via verifyExportToken. Returns false for tokens
 * that are syntactically broken or past expiry; true means "worth
 * checking further".
 */
export function isExportTokenWellFormed(token: string): boolean {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const [planId, expiresAtStr, sigHex] = parts;
	if (!planId) return false;
	const expiresAt = parseInt(expiresAtStr, 10);
	if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
	if (!/^[0-9a-f]+$/i.test(sigHex)) return false;
	return true;
}
