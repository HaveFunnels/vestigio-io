import { describe, it, expect } from "vitest";
import { canonicalSourceKey, sourceIdentity, identifySource } from "./source-identity";

// EXAME A2 — one identity for a traffic source across the whole plan.
// The September plan showed "facebook" in the measured table and
// "Facebook Ads" in journeys for the same sessions, and passed any raw
// utm_source token to the customer in lowercase.

describe("canonicalSourceKey", () => {
	it("folds aliases into one key", () => {
		expect(canonicalSourceKey({ source: "fb" })).toBe("facebook");
		expect(canonicalSourceKey({ source: "meta" })).toBe("facebook");
		expect(canonicalSourceKey({ source: "ig" })).toBe("instagram");
		expect(canonicalSourceKey({ source: "TikTok" })).toBe("tiktok");
	});

	it("click ids and paid medium resolve to the ads identity", () => {
		expect(canonicalSourceKey({ source: "google", gclid: "x" })).toBe("google_ads");
		expect(canonicalSourceKey({ source: "google", medium: "cpc" })).toBe("google_ads");
		expect(canonicalSourceKey({ source: "facebook", fbclid: "y" })).toBe("facebook_ads");
		expect(canonicalSourceKey({ source: "facebook", medium: "paid_social" })).toBe("facebook_ads");
	});

	it("no source: referrer means referral, nothing means direct", () => {
		expect(canonicalSourceKey({ referrer: "https://blog.example.com/x" })).toBe("referral");
		expect(canonicalSourceKey({})).toBe("direct");
	});

	it("organic search stays organic without a paid signal", () => {
		expect(canonicalSourceKey({ source: "google", medium: "organic" })).toBe("organic");
		expect(canonicalSourceKey({ source: "bing" })).toBe("organic");
	});
});

describe("sourceIdentity", () => {
	it("known keys get a proper label and a brand color", () => {
		expect(sourceIdentity("tiktok").label).toBe("TikTok");
		expect(sourceIdentity("direct").label).toBe("Direto");
		expect(sourceIdentity("facebook").color).toBe("#1877F2");
	});

	it("unknown utm tokens are capitalized, never raw-lowercase", () => {
		expect(sourceIdentity("newsletter-set").label).toBe("Newsletter Set");
	});

	it("referral names the referring host", () => {
		expect(sourceIdentity("referral", "https://www.blog.com/post").label).toBe(
			"Referência (blog.com)",
		);
	});
});

describe("identifySource", () => {
	it("measured table and journeys resolve the SAME label for the same session", () => {
		const signals = { source: "tiktok", medium: "paid" };
		const viaKey = sourceIdentity(canonicalSourceKey(signals)).label;
		const direct = identifySource(signals).label;
		expect(direct).toBe(viaKey);
	});
});
