import crypto from "crypto";

// ──────────────────────────────────────────────
// OAuth State — HMAC-signed CSRF token carrier
//
// Encodes `{ environmentId, provider, timestamp, nonce }` as a URL-
// safe string `<base64url(payload)>.<base64url(hmac)>`. Verifies on
// callback that the signature matches and the token is fresh (< 10
// min). Prevents CSRF + replay.
//
// Signing secret comes from NEXTAUTH_SECRET (already required env
// var) so we don't need yet another secret.
// ──────────────────────────────────────────────

const MAX_AGE_MS = 10 * 60 * 1000;

function getSecret(): string {
	const secret = process.env.NEXTAUTH_SECRET || process.env.OAUTH_STATE_SECRET;
	if (!secret) {
		throw new Error("NEXTAUTH_SECRET is required for OAuth state signing");
	}
	return secret;
}

function b64urlEncode(input: string): string {
	return Buffer.from(input, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
	const pad = input.length % 4;
	const padded = pad ? input + "=".repeat(4 - pad) : input;
	return Buffer.from(
		padded.replace(/-/g, "+").replace(/_/g, "/"),
		"base64",
	).toString("utf8");
}

export interface OAuthStatePayload {
	environmentId: string;
	provider: "meta_ads" | "google_ads" | "stripe";
	timestamp: number;
	nonce: string;
}

export function encodeOAuthState(
	environmentId: string,
	provider: "meta_ads" | "google_ads" | "stripe",
): string {
	const payload: OAuthStatePayload = {
		environmentId,
		provider,
		timestamp: Date.now(),
		nonce: crypto.randomBytes(8).toString("hex"),
	};
	const payloadJson = JSON.stringify(payload);
	const payloadEncoded = b64urlEncode(payloadJson);
	const sig = crypto
		.createHmac("sha256", getSecret())
		.update(payloadEncoded)
		.digest();
	const sigEncoded = sig
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `${payloadEncoded}.${sigEncoded}`;
}

export function decodeOAuthState(
	state: string | null | undefined,
): { ok: true; payload: OAuthStatePayload } | { ok: false; error: string } {
	if (!state) return { ok: false, error: "state missing" };
	const parts = state.split(".");
	if (parts.length !== 2) return { ok: false, error: "state malformed" };
	const [payloadEncoded, sigEncoded] = parts;

	// Constant-time signature compare
	const expected = crypto
		.createHmac("sha256", getSecret())
		.update(payloadEncoded)
		.digest();
	const expectedEncoded = expected
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	if (
		sigEncoded.length !== expectedEncoded.length ||
		!crypto.timingSafeEqual(
			Buffer.from(sigEncoded),
			Buffer.from(expectedEncoded),
		)
	) {
		return { ok: false, error: "state signature mismatch" };
	}

	let payload: OAuthStatePayload;
	try {
		payload = JSON.parse(b64urlDecode(payloadEncoded));
	} catch {
		return { ok: false, error: "state payload unparseable" };
	}

	if (!payload.environmentId || !payload.provider) {
		return { ok: false, error: "state payload missing fields" };
	}
	if (Date.now() - payload.timestamp > MAX_AGE_MS) {
		return { ok: false, error: "state expired" };
	}

	return { ok: true, payload };
}
