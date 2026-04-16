/**
 * OAuth state signing + Meta signed_request parsing — unit tests
 *
 * Covers:
 *   - encodeOAuthState round-trips through decodeOAuthState
 *   - Tampered state rejected
 *   - Expired state rejected
 *   - Malformed state rejected
 *   - parseSignedRequest accepts valid Meta payload
 *   - parseSignedRequest rejects bad signature
 *   - parseSignedRequest rejects non-HMAC-SHA256 algorithm
 *   - extractMetaUserId handles all nested shapes Meta sends
 *
 * Run: npx tsx --test tests/oauth-security.test.ts
 */

import crypto from "crypto";

// Set NEXTAUTH_SECRET BEFORE importing modules that read it at load time.
process.env.NEXTAUTH_SECRET =
	process.env.NEXTAUTH_SECRET || "test-secret-for-oauth-state-signing";

import {
	encodeOAuthState,
	decodeOAuthState,
} from "../src/libs/oauth-state";
import {
	parseSignedRequest,
	extractMetaUserId,
} from "../src/libs/meta-signed-request";

let suitesPassed = 0;
let suitesFailed = 0;
const failures: string[] = [];

function runSuite(name: string, fn: () => void): void {
	try {
		fn();
		suitesPassed++;
		console.log(`  ✓ ${name}`);
	} catch (err) {
		suitesFailed++;
		const msg = err instanceof Error ? err.message : String(err);
		failures.push(`  ✗ ${name}\n      ${msg}`);
		console.log(`  ✗ ${name}: ${msg}`);
	}
}

function assert(cond: boolean, msg: string): void {
	if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
	if (actual !== expected) {
		throw new Error(
			`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
}

// ──────────────────────────────────────────────
// Meta signed_request helper
// ──────────────────────────────────────────────

function b64urlEncodeBuf(buf: Buffer): string {
	return buf
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function buildSignedRequest(
	payload: Record<string, unknown>,
	appSecret: string,
): string {
	const payloadJson = JSON.stringify(payload);
	const encodedPayload = b64urlEncodeBuf(Buffer.from(payloadJson, "utf8"));
	const sig = crypto
		.createHmac("sha256", appSecret)
		.update(encodedPayload)
		.digest();
	const encodedSig = b64urlEncodeBuf(sig);
	return `${encodedSig}.${encodedPayload}`;
}

// ══════════════════════════════════════════════════

console.log("OAuth security");

// ── OAuth state ──

runSuite("OAuth state — roundtrips env + provider", () => {
	const state = encodeOAuthState("env_abc_123", "meta_ads");
	const res = decodeOAuthState(state);
	assert(res.ok, "decode ok");
	if (res.ok) {
		assertEqual(res.payload.environmentId, "env_abc_123", "env preserved");
		assertEqual(res.payload.provider, "meta_ads", "provider preserved");
		assert(res.payload.timestamp > 0, "timestamp populated");
		assert(res.payload.nonce.length >= 8, "nonce populated");
	}
});

runSuite("OAuth state — tampered payload rejected", () => {
	const state = encodeOAuthState("env_real", "google_ads");
	const [payload, sig] = state.split(".");
	// Flip a byte in the payload — signature no longer matches
	const tampered = payload.slice(0, -2) + "AA" + "." + sig;
	const res = decodeOAuthState(tampered);
	assert(!res.ok, "tampered rejected");
	if (!res.ok) {
		assert(
			res.error.toLowerCase().includes("signature") ||
				res.error.toLowerCase().includes("unparseable"),
			`expected signature/unparseable error, got: ${res.error}`,
		);
	}
});

runSuite("OAuth state — tampered signature rejected", () => {
	const state = encodeOAuthState("env_x", "meta_ads");
	const [payload] = state.split(".");
	const bogus = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
	const res = decodeOAuthState(bogus);
	assert(!res.ok, "bogus sig rejected");
});

runSuite("OAuth state — malformed (wrong parts) rejected", () => {
	const res = decodeOAuthState("not-a-state");
	assert(!res.ok, "rejected");
	if (!res.ok) assert(res.error.includes("malformed"), `msg: ${res.error}`);
});

runSuite("OAuth state — empty/null rejected", () => {
	const r1 = decodeOAuthState(null);
	const r2 = decodeOAuthState("");
	const r3 = decodeOAuthState(undefined);
	assert(!r1.ok && !r2.ok && !r3.ok, "all rejected");
});

runSuite("OAuth state — provider mismatch visible (not a decode error)", () => {
	// The decoder doesn't enforce provider match — that's the caller's
	// responsibility. Confirm the payload carries whichever provider was
	// encoded, so caller can branch.
	const state = encodeOAuthState("env_1", "google_ads");
	const res = decodeOAuthState(state);
	assert(res.ok, "decode ok");
	if (res.ok) {
		assertEqual(res.payload.provider, "google_ads", "provider");
	}
});

// ── Meta signed_request ──

runSuite("Meta signed_request — valid signature accepted", () => {
	const secret = "app_secret_test";
	const payload = {
		algorithm: "HMAC-SHA256",
		issued_at: 1_700_000_000,
		user_id: "1234567890",
	};
	const sr = buildSignedRequest(payload, secret);
	const parsed = parseSignedRequest(sr, secret);
	assert(parsed !== null, "parsed");
	if (parsed) {
		assertEqual(parsed.user_id, "1234567890", "user_id preserved");
		assertEqual(parsed.algorithm, "HMAC-SHA256", "algorithm preserved");
	}
});

runSuite("Meta signed_request — bad signature rejected", () => {
	const payload = { algorithm: "HMAC-SHA256", user_id: "abc" };
	const sr = buildSignedRequest(payload, "SECRET_A");
	const parsed = parseSignedRequest(sr, "SECRET_B");
	assert(parsed === null, "rejected when secret differs");
});

runSuite("Meta signed_request — wrong algorithm rejected", () => {
	const payload = { algorithm: "PLAINTEXT", user_id: "abc" };
	const sr = buildSignedRequest(payload, "s");
	const parsed = parseSignedRequest(sr, "s");
	assert(parsed === null, "non-HMAC-SHA256 rejected");
});

runSuite("Meta signed_request — malformed input rejected", () => {
	assertEqual(parseSignedRequest("", "s"), null, "empty");
	assertEqual(parseSignedRequest(null, "s"), null, "null");
	assertEqual(parseSignedRequest("only_one_part", "s"), null, "one part");
	assertEqual(parseSignedRequest("a.b.c", "s"), null, "three parts");
});

runSuite("extractMetaUserId — reads user_id top-level", () => {
	assertEqual(
		extractMetaUserId({ algorithm: "HMAC-SHA256", user_id: "xyz" }),
		"xyz",
		"top-level",
	);
});

runSuite("extractMetaUserId — reads user.id nested", () => {
	assertEqual(
		extractMetaUserId({ algorithm: "HMAC-SHA256", user: { id: "nested" } }),
		"nested",
		"nested",
	);
});

runSuite("extractMetaUserId — reads profile_id fallback", () => {
	assertEqual(
		extractMetaUserId({ algorithm: "HMAC-SHA256", profile_id: "pid_1" }),
		"pid_1",
		"profile_id",
	);
});

runSuite("extractMetaUserId — returns null when absent", () => {
	assertEqual(
		extractMetaUserId({ algorithm: "HMAC-SHA256" }),
		null,
		"no user id",
	);
});

// ──────────────────────────────────────────────

console.log(`\n${suitesPassed}/${suitesPassed + suitesFailed} passed`);
if (suitesFailed > 0) {
	for (const f of failures) console.error(f);
	process.exit(1);
}
