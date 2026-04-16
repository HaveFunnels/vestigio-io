import crypto from "crypto";

// ──────────────────────────────────────────────
// Meta Signed Request Parsing
//
// Meta sends webhooks for Data Deletion + Deauthorize as:
//   POST application/x-www-form-urlencoded
//   body: signed_request=<base64url>.<base64url>
//
// Format: `<b64url_hmac_sha256(payload, app_secret)>.<b64url(payload_json)>`
//
// Note: Meta's encoding is base64url WITHOUT padding. We strip padding
// when encoding and tolerate missing padding when decoding.
//
// Returns the parsed payload when signature matches; null on failure.
// ──────────────────────────────────────────────

export interface MetaSignedRequestPayload {
	algorithm: string;
	issued_at?: number;
	expires?: number;
	user_id?: string;
	user?: { id?: string };
	profile_id?: string;
	/** Meta sometimes sends app-scoped user ID under different keys */
	[key: string]: unknown;
}

function b64urlToBuffer(input: string): Buffer {
	const pad = input.length % 4;
	const padded = pad ? input + "=".repeat(4 - pad) : input;
	return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function parseSignedRequest(
	signedRequest: string | null | undefined,
	appSecret: string,
): MetaSignedRequestPayload | null {
	if (!signedRequest || !appSecret) return null;
	const parts = signedRequest.split(".");
	if (parts.length !== 2) return null;
	const [encodedSig, encodedPayload] = parts;

	let expected: Buffer;
	try {
		expected = crypto
			.createHmac("sha256", appSecret)
			.update(encodedPayload)
			.digest();
	} catch {
		return null;
	}

	let actual: Buffer;
	try {
		actual = b64urlToBuffer(encodedSig);
	} catch {
		return null;
	}

	if (expected.length !== actual.length) return null;
	if (!crypto.timingSafeEqual(expected, actual)) return null;

	let payload: MetaSignedRequestPayload;
	try {
		payload = JSON.parse(b64urlToBuffer(encodedPayload).toString("utf8"));
	} catch {
		return null;
	}

	if (payload.algorithm !== "HMAC-SHA256") return null;
	return payload;
}

export function extractMetaUserId(
	payload: MetaSignedRequestPayload,
): string | null {
	if (typeof payload.user_id === "string" && payload.user_id) return payload.user_id;
	if (payload.user && typeof payload.user.id === "string" && payload.user.id) {
		return payload.user.id;
	}
	if (typeof payload.profile_id === "string" && payload.profile_id) return payload.profile_id;
	return null;
}
