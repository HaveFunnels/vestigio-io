// ──────────────────────────────────────────────
// Lead Form Input Validation
//
// Catches obviously fake data BEFORE the lead row gets created. The
// goal isn't to be exhaustive — it's to filter the lazy 80% of bad
// data (johndoe@gmail.com, 99999999, $1B revenue, example.com) so
// the funnel quality stays high and the cache cap on real domains
// doesn't get poisoned with garbage.
//
// Each validator returns either { ok: true } or { ok: false, reason }.
// The route handler (POST /api/lead/start, /api/lead/[id]/step/N)
// runs the relevant subset and returns 422 with the user-friendly
// reason on failure.
//
// All reason strings are user-facing — keep them friendly, in the
// product voice. They get rendered next to the field that failed.
// ──────────────────────────────────────────────

export type ValidationResult = { ok: true } | { ok: false; reason: string };

// ──────────────────────────────────────────────
// Email validation
// ──────────────────────────────────────────────

const FAKE_EMAIL_LOCALS = new Set([
	"test",
	"teste",
	"asdf",
	"qwerty",
	"johndoe",
	"janedoe",
	"john.doe",
	"jane.doe",
	"noreply",
	"no-reply",
	"fake",
	"spam",
	"abc",
	"xyz",
	"foo",
	"bar",
	"baz",
	"hello",
	"hi",
	"sample",
	"example",
	"demo",
]);

const FAKE_EMAIL_LOCAL_REGEX = /^(test|user|admin|info|contact|hello)\d*$/i;

const FAKE_EMAIL_DOMAINS = new Set([
	"example.com",
	"example.org",
	"example.net",
	"test.com",
	"test.org",
	"domain.com",
	"email.com",
	"mail.com",
	"yourdomain.com",
	"yourcompany.com",
	"company.com",
	"sample.com",
]);

// Disposable email providers — embedded list of the most common ~30.
// The full public list (~3000) lives at
// https://github.com/disposable-email-domains/disposable-email-domains
// but we don't bundle it; this short list catches the lazy attempts.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
	"mailinator.com",
	"10minutemail.com",
	"10minutemail.net",
	"guerrillamail.com",
	"guerrillamail.net",
	"guerrillamail.org",
	"guerrillamail.biz",
	"sharklasers.com",
	"yopmail.com",
	"yopmail.fr",
	"yopmail.net",
	"tempmail.com",
	"temp-mail.org",
	"temp-mail.io",
	"throwawaymail.com",
	"trashmail.com",
	"maildrop.cc",
	"getairmail.com",
	"fakeinbox.com",
	"emailondeck.com",
	"discard.email",
	"dispostable.com",
	"mintemail.com",
	"mohmal.com",
	"spam4.me",
	"tempinbox.com",
	"throwam.com",
]);

const EMAIL_REGEX = /^[^\s@]+@([^\s@]+)\.([^\s@]+)$/;

export function validateLeadEmail(email: string): ValidationResult {
	if (!email) return { ok: false, reason: "Email is required." };

	const trimmed = email.trim().toLowerCase();
	if (!EMAIL_REGEX.test(trimmed)) {
		return { ok: false, reason: "Please enter a valid email address." };
	}

	const [local, ...domainParts] = trimmed.split("@");
	const domain = domainParts.join("@");

	if (FAKE_EMAIL_LOCALS.has(local) || FAKE_EMAIL_LOCAL_REGEX.test(local)) {
		return {
			ok: false,
			reason: "Please use your real work email — we'll send your audit there.",
		};
	}

	if (FAKE_EMAIL_DOMAINS.has(domain)) {
		return {
			ok: false,
			reason: "That looks like a placeholder domain. Please use your real email.",
		};
	}

	if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
		return {
			ok: false,
			reason: "Disposable email addresses aren't supported. Please use your work email.",
		};
	}

	return { ok: true };
}

// ──────────────────────────────────────────────
// Phone validation
// ──────────────────────────────────────────────

export function validateLeadPhone(phone: string, optional: boolean = true): ValidationResult {
	if (!phone) {
		return optional ? { ok: true } : { ok: false, reason: "Phone is required." };
	}

	// Strip all non-digit chars except leading +
	const cleaned = phone.replace(/[\s\-()]/g, "");
	const digitsOnly = cleaned.replace(/^\+/, "");

	if (digitsOnly.length < 8 || digitsOnly.length > 15) {
		return { ok: false, reason: "Phone must have 8–15 digits including country code." };
	}

	if (!/^\d+$/.test(digitsOnly)) {
		return { ok: false, reason: "Phone can only contain digits, +, spaces, dashes, parens." };
	}

	// All same digits — 11111111, 99999999, etc.
	if (/^(\d)\1+$/.test(digitsOnly)) {
		return {
			ok: false,
			reason: "Please enter a real phone number.",
		};
	}

	// Strictly sequential — 12345678, 87654321
	const sortedAsc = digitsOnly.split("").every((d, i, arr) => i === 0 || parseInt(d) === parseInt(arr[i - 1]) + 1);
	const sortedDesc = digitsOnly.split("").every((d, i, arr) => i === 0 || parseInt(d) === parseInt(arr[i - 1]) - 1);
	if (sortedAsc || sortedDesc) {
		return { ok: false, reason: "Please enter a real phone number." };
	}

	return { ok: true };
}

// ──────────────────────────────────────────────
// Revenue validation
//
// Acceptable monthly revenue range for a real business that would
// realistically pay for Vestigio: $500/mo to $5M/mo.
// ──────────────────────────────────────────────

const MIN_REVENUE_USD = 500;
const MAX_REVENUE_USD = 5_000_000;

export function validateLeadRevenue(revenue: number | null | undefined): ValidationResult {
	if (revenue == null || revenue === 0) {
		return {
			ok: false,
			reason: "Please enter a realistic monthly revenue (we use this to size your audit).",
		};
	}

	if (revenue < 0) {
		return { ok: false, reason: "Revenue cannot be negative." };
	}

	if (revenue < MIN_REVENUE_USD) {
		return {
			ok: false,
			reason: "We work best with businesses doing at least $500/mo. Come back when you scale.",
		};
	}

	if (revenue > MAX_REVENUE_USD) {
		return {
			ok: false,
			reason: "That's a big number — please enter a realistic figure or contact sales for enterprise.",
		};
	}

	return { ok: true };
}

// ──────────────────────────────────────────────
// Domain blocklist
//
// Top-100 sites that we never let anyone audit via /lp/audit:
//   - Prevents abuse (auditing google.com 10000 times)
//   - Prevents the cache cap from being poisoned
//   - Prevents the prospect from being told "your audit of facebook.com is ready"
//
// Hardcoded short list of the most likely abuse targets. Not exhaustive
// by design — the rate limiter + cache catch the rest.
// ──────────────────────────────────────────────

const BLOCKLISTED_DOMAINS = new Set([
	// FAANG + tech giants
	"google.com",
	"facebook.com",
	"meta.com",
	"instagram.com",
	"whatsapp.com",
	"amazon.com",
	"apple.com",
	"microsoft.com",
	"netflix.com",
	"linkedin.com",
	"twitter.com",
	"x.com",
	"tiktok.com",
	"youtube.com",
	"reddit.com",
	"pinterest.com",
	"snapchat.com",
	// Search / news
	"yahoo.com",
	"bing.com",
	"duckduckgo.com",
	"cnn.com",
	"bbc.com",
	"nytimes.com",
	"wsj.com",
	"ft.com",
	"theguardian.com",
	"reuters.com",
	// Cloud / SaaS giants
	"github.com",
	"gitlab.com",
	"openai.com",
	"anthropic.com",
	"cloudflare.com",
	"vercel.com",
	"netlify.com",
	"aws.amazon.com",
	"azure.microsoft.com",
	"cloud.google.com",
	"shopify.com",
	"stripe.com",
	"paypal.com",
	"slack.com",
	"zoom.us",
	"notion.so",
	"figma.com",
	"discord.com",
	"telegram.org",
	// Brazilian incumbents (Vestigio is Brazil-first)
	"globo.com",
	"uol.com.br",
	"terra.com.br",
	"r7.com",
	"folha.uol.com.br",
	"estadao.com.br",
	"mercadolivre.com.br",
	"americanas.com.br",
	"magazineluiza.com.br",
	"casasbahia.com.br",
	"submarino.com.br",
	"shopee.com.br",
	"aliexpress.com",
	// Test / placeholder domains
	"example.com",
	"example.org",
	"example.net",
	"test.com",
	"localhost",
	"vestigio.io",
	"vestigio.com",
]);

export function validateLeadDomain(rawDomain: string): ValidationResult {
	if (!rawDomain) return { ok: false, reason: "Domain is required." };

	// Normalize: strip protocol, www., trailing slash, path
	const normalized = rawDomain
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.split("/")[0]
		.split("?")[0];

	if (!normalized) return { ok: false, reason: "Domain is required." };

	// Basic format check
	const formatRegex = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+)$/;
	if (!formatRegex.test(normalized)) {
		return { ok: false, reason: "Please enter a valid domain (e.g. example.com)." };
	}

	// IP address check — reject any pure IPv4
	if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
		return { ok: false, reason: "Please enter a domain name, not an IP address." };
	}

	// Localhost / private network
	if (
		normalized === "localhost" ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal")
	) {
		return { ok: false, reason: "We can only audit public websites." };
	}

	// Vestigio's own domains
	if (
		normalized === "vestigio.io" ||
		normalized === "vestigio.com" ||
		normalized.endsWith(".vestigio.io") ||
		normalized.endsWith(".vestigio.com")
	) {
		return { ok: false, reason: "Nice try — but we can't audit ourselves." };
	}

	// Top-100 blocklist
	if (BLOCKLISTED_DOMAINS.has(normalized)) {
		return {
			ok: false,
			reason: "This domain isn't eligible for free audits. Use one you own.",
		};
	}

	return { ok: true };
}

// ──────────────────────────────────────────────
// Organization name validation
// ──────────────────────────────────────────────

export function validateLeadOrgName(name: string): ValidationResult {
	if (!name || !name.trim()) {
		return { ok: false, reason: "Please enter your organization name." };
	}
	if (name.trim().length < 2) {
		return { ok: false, reason: "Organization name is too short." };
	}
	if (name.trim().length > 100) {
		return { ok: false, reason: "Organization name is too long." };
	}
	const lower = name.trim().toLowerCase();
	if (["test", "asdf", "qwerty", "abc", "xyz", "fake", "spam"].includes(lower)) {
		return { ok: false, reason: "Please enter your real organization name." };
	}
	return { ok: true };
}

// ──────────────────────────────────────────────
// Domain hash for cache lookup
// ──────────────────────────────────────────────

import { createHash } from "node:crypto";

export function normalizeDomain(rawDomain: string): string {
	return rawDomain
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.split("/")[0]
		.split("?")[0];
}

export function hashDomain(rawDomain: string): string {
	const normalized = normalizeDomain(rawDomain);
	return createHash("sha256").update(normalized).digest("hex");
}
