import { createHmac, timingSafeEqual } from "node:crypto";

// ──────────────────────────────────────────────
// Lead Form Anti-Bot Defense Stack
//
// Multi-layer defenses for the /lp/audit funnel that don't show ANY
// captcha to the user (zero friction). The goal isn't to stop a
// determined adversary — it's to make automated abuse uneconomical
// while keeping the human path completely smooth.
//
// Layers (each implemented in this file):
//   1. Cryptographic form session token (HMAC, 30min TTL) — bot has to
//      scrape the form HTML to get a valid token
//   2. JS-only header (X-Vestigio-Form-Session) — curl/wget don't set it
//   3. Honeypot field — silently marks lead as spam if filled
//   4. Time-on-form check — reject submits faster than 8s
//   5. Behavioral score — frontend reports event count (mousemove,
//      keydown, scroll); zero events = bot signal
//
// Layers NOT in this file (live elsewhere):
//   - Per-IP / per-email rate limiting → src/libs/lead-rate-limit.ts
//   - Disposable email blocklist → src/libs/lead-validation.ts
//   - Domain blocklist (top sites, IPs) → src/libs/lead-validation.ts
//   - Cache-by-domain (14d) → /api/lead/start route logic
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// 1. Form session token (HMAC)
//
// Issued when the visitor lands on /lp/audit. Encodes IP + ts. Verified
// on every step submission. Expires after 30 min so the bot can't reuse
// a leaked token indefinitely.
// ──────────────────────────────────────────────

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSecret(): string {
	const secret = process.env.LEAD_FORM_SECRET || process.env.SECRET || "";
	if (!secret || secret.length < 16) {
		// In dev/test, fall back to a known-bad value so things still work.
		// In production, env-validation should catch this earlier.
		return "vestigio-lead-form-dev-secret-do-not-use-in-prod";
	}
	return secret;
}

export function issueFormToken(ip: string): string {
	const ts = Date.now();
	const payload = `${ts}.${ip}`;
	const sig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
	return `${ts}.${sig}`;
}

export interface FormTokenVerification {
	valid: boolean;
	reason?: string;
}

export function verifyFormToken(token: string | null | undefined, ip: string): FormTokenVerification {
	if (!token) return { valid: false, reason: "missing_token" };

	const parts = token.split(".");
	if (parts.length !== 2) return { valid: false, reason: "malformed_token" };

	const [tsStr, sig] = parts;
	const ts = parseInt(tsStr, 10);
	if (isNaN(ts)) return { valid: false, reason: "bad_timestamp" };

	if (Date.now() - ts > TOKEN_TTL_MS) {
		return { valid: false, reason: "token_expired" };
	}

	const expectedSig = createHmac("sha256", getSecret())
		.update(`${ts}.${ip}`)
		.digest("base64url");

	// Constant-time comparison to defeat timing oracles.
	let sigMatches = false;
	try {
		const a = Buffer.from(sig);
		const b = Buffer.from(expectedSig);
		if (a.length === b.length) {
			sigMatches = timingSafeEqual(a, b);
		}
	} catch {
		sigMatches = false;
	}

	if (!sigMatches) return { valid: false, reason: "bad_signature" };
	return { valid: true };
}

// ──────────────────────────────────────────────
// 2. JS-only header check
//
// curl/wget/python-requests don't set custom headers by default. The
// frontend always includes X-Vestigio-Form-Session on every fetch. If
// it's missing, treat the request as bot-suspicious. NOT a hard reject
// (some legitimate proxies strip custom headers) — used as one signal
// in the behavioral score.
// ──────────────────────────────────────────────

export const FORM_SESSION_HEADER = "x-vestigio-form-session";

export function hasFormSessionHeader(headers: Headers): boolean {
	return !!headers.get(FORM_SESSION_HEADER);
}

// ──────────────────────────────────────────────
// 3. Honeypot field
//
// The form contains a hidden input named `website` (or `company_url`).
// Real visitors never see/touch it (display:none + aria-hidden + tabindex=-1).
// Bots that auto-fill every visible field will fill it. Submission with
// the honeypot filled returns a fake 200 OK so the bot thinks it worked,
// but the lead is silently flagged `status='spam'` and never processed.
// ──────────────────────────────────────────────

export const HONEYPOT_FIELD_NAME = "website";

export function isHoneypotTripped(formBody: Record<string, unknown>): boolean {
	const value = formBody[HONEYPOT_FIELD_NAME];
	if (typeof value !== "string") return false;
	return value.trim().length > 0;
}

// ──────────────────────────────────────────────
// 4. Time-on-form check
//
// Frontend marks `formStartedAt` on mount. The lead row carries it.
// Submits faster than the human-impossible threshold are rejected.
//
// 8 seconds is the lower bound for completing a 4-step form even with
// browser autofill — anything faster is almost certainly automation.
// ──────────────────────────────────────────────

const MIN_FORM_DWELL_MS = 8_000;

export function isFormDwellSuspicious(formStartedAt: Date | string | null | undefined): boolean {
	if (!formStartedAt) return true; // missing = suspicious
	const startedMs = typeof formStartedAt === "string" ? Date.parse(formStartedAt) : formStartedAt.getTime();
	if (isNaN(startedMs)) return true;
	return Date.now() - startedMs < MIN_FORM_DWELL_MS;
}

// ──────────────────────────────────────────────
// 5. Behavioral score
//
// Frontend counts user events (mousemove, keydown, focus, blur, scroll)
// during the form session and reports the total at submit time. Real
// humans easily generate 50-200+ events filling out a 4-step form.
// Bots typically report 0.
//
// Score is computed server-side so the frontend can't lie up — but a
// bot CAN lie up. That's fine: this is one of N signals, not the only
// gate.
// ──────────────────────────────────────────────

export interface BehavioralSignals {
	eventCount: number; // total mousemove + keydown + focus + scroll
	hasFormSessionHeader: boolean;
	hasMouseEvents: boolean;
	hasKeyboardEvents: boolean;
}

export function computeBehavioralScore(signals: BehavioralSignals): number {
	let score = 0;

	// Event count is the strongest signal — humans rack up 50-500.
	if (signals.eventCount >= 50) score += 50;
	else if (signals.eventCount >= 20) score += 35;
	else if (signals.eventCount >= 10) score += 20;
	else if (signals.eventCount >= 5) score += 10;
	// 0-4 events: 0 points

	if (signals.hasMouseEvents) score += 20;
	if (signals.hasKeyboardEvents) score += 20;
	if (signals.hasFormSessionHeader) score += 10;

	return Math.min(100, score);
}

// ──────────────────────────────────────────────
// Composite verdict
//
// Convenience helper that runs the whole stack at once and returns a
// single verdict the route handler can branch on.
// ──────────────────────────────────────────────

export interface DefenseVerdict {
	allowed: boolean;
	reason?: string;
	score: number;
	silentSpam: boolean; // honeypot hit → return fake success
}

export interface DefenseInput {
	token: string | null | undefined;
	ip: string;
	formBody: Record<string, unknown>;
	formStartedAt: Date | string | null | undefined;
	behavioral: BehavioralSignals;
}

export function evaluateDefenses(input: DefenseInput): DefenseVerdict {
	// Honeypot first — silent spam, fake success
	if (isHoneypotTripped(input.formBody)) {
		return { allowed: false, silentSpam: true, reason: "honeypot", score: 0 };
	}

	// Token validation — hard reject
	const tokenCheck = verifyFormToken(input.token, input.ip);
	if (!tokenCheck.valid) {
		return { allowed: false, silentSpam: false, reason: tokenCheck.reason, score: 0 };
	}

	// Time check — hard reject
	if (isFormDwellSuspicious(input.formStartedAt)) {
		return { allowed: false, silentSpam: false, reason: "form_too_fast", score: 0 };
	}

	// Behavioral score
	const score = computeBehavioralScore(input.behavioral);
	if (score < 30) {
		return { allowed: false, silentSpam: false, reason: "low_behavioral_score", score };
	}

	return { allowed: true, silentSpam: false, score };
}
