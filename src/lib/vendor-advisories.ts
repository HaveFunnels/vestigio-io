/**
 * vendor-advisories — Curated security advisory feed surface for
 * Wave 11.4f.
 *
 * Without runtime version detection, we deliberately don't try to
 * match CVEs to specific versions — that produces noise. Instead we
 * curate the canonical advisory feed URL for each detected vendor
 * (so the user has one consolidated jump list) plus the most
 * impactful recent critical advisories worth verifying against.
 *
 * Source notes (verified 2026-05): URLs from each vendor's official
 * security pages. Refresh periodically as advisories evolve.
 */

export interface VendorAdvisoryEntry {
	technologyKey: string;
	advisoryUrl: string;
	/** A few high-impact known issues worth verifying. Empty array is fine. */
	notable: NotableAdvisory[];
}

export interface NotableAdvisory {
	/** CVE ID or vendor advisory ID */
	id: string;
	/** YYYY-MM month-precision is enough */
	publishedAt: string;
	severity: "critical" | "high" | "medium";
	summary: string;
	/** Plain-English mitigation hint, one sentence */
	mitigation: string;
}

export const VENDOR_ADVISORIES: VendorAdvisoryEntry[] = [
	// ── Hosting ─────────────────────────────────
	{
		technologyKey: "vercel",
		advisoryUrl: "https://vercel.com/security/advisories",
		notable: [],
	},
	{
		technologyKey: "shopify",
		advisoryUrl: "https://help.shopify.com/en/manual/your-account/security",
		notable: [],
	},
	{
		technologyKey: "wordpress",
		advisoryUrl: "https://wordpress.org/news/category/security/",
		notable: [
			{
				id: "WordPress-LiteSpeed-2024",
				publishedAt: "2024-09",
				severity: "critical",
				summary: "LiteSpeed Cache plugin: privilege escalation (CVE-2024-28000) affected 5M+ sites.",
				mitigation: "If LiteSpeed Cache is installed, ensure version 6.4+ is running.",
			},
			{
				id: "WordPress-Forminator-2024",
				publishedAt: "2024-10",
				severity: "critical",
				summary: "Forminator plugin arbitrary file upload (CVE-2024-9889).",
				mitigation: "Update Forminator to 1.29.3+ — or remove if unused.",
			},
		],
	},
	{
		technologyKey: "woocommerce",
		advisoryUrl: "https://developer.woocommerce.com/docs/security/",
		notable: [],
	},

	// ── Payments ────────────────────────────────
	{
		technologyKey: "stripe",
		advisoryUrl: "https://stripe.com/docs/security",
		notable: [],
	},
	{
		technologyKey: "paypal",
		advisoryUrl: "https://www.paypal.com/us/security",
		notable: [],
	},

	// ── CDN ─────────────────────────────────────
	{
		technologyKey: "cloudflare",
		advisoryUrl: "https://blog.cloudflare.com/tag/security/",
		notable: [
			{
				id: "CVE-2024-3661",
				publishedAt: "2024-05",
				severity: "high",
				summary: "TunnelVision: VPN traffic can be leaked via DHCP option 121 manipulation on hostile networks.",
				mitigation: "Affects users not vendor stack directly. Educate ops team about hostile-WiFi DHCP risk.",
			},
		],
	},
	{
		technologyKey: "fastly",
		advisoryUrl: "https://www.fastly.com/security-advisories",
		notable: [],
	},

	// ── Email ───────────────────────────────────
	{
		technologyKey: "sendgrid",
		advisoryUrl: "https://www.twilio.com/docs/security",
		notable: [],
	},
	{
		technologyKey: "mailgun",
		advisoryUrl: "https://www.mailgun.com/security/",
		notable: [],
	},
	{
		technologyKey: "klaviyo",
		advisoryUrl: "https://www.klaviyo.com/legal/security",
		notable: [],
	},

	// ── Error tracking ──────────────────────────
	{
		technologyKey: "sentry",
		advisoryUrl: "https://sentry.io/security/",
		notable: [],
	},
	{
		technologyKey: "datadog",
		advisoryUrl: "https://www.datadoghq.com/security-advisories/",
		notable: [],
	},

	// ── Analytics ───────────────────────────────
	{
		technologyKey: "google_analytics",
		advisoryUrl: "https://support.google.com/analytics/answer/6004245",
		notable: [],
	},
	{
		technologyKey: "facebook_pixel",
		advisoryUrl: "https://www.facebook.com/security/advisories",
		notable: [],
	},

	// ── Support ─────────────────────────────────
	{
		technologyKey: "intercom",
		advisoryUrl: "https://www.intercom.com/security",
		notable: [],
	},
	{
		technologyKey: "zendesk",
		advisoryUrl: "https://www.zendesk.com/trust-center/security/",
		notable: [],
	},

	// ── Consent ─────────────────────────────────
	{
		technologyKey: "onetrust",
		advisoryUrl: "https://www.onetrust.com/security/",
		notable: [],
	},

	// ── A/B testing ─────────────────────────────
	{
		technologyKey: "optimizely",
		advisoryUrl: "https://www.optimizely.com/security/",
		notable: [],
	},
	{
		technologyKey: "launchdarkly",
		advisoryUrl: "https://launchdarkly.com/security/",
		notable: [],
	},
];

const BY_KEY: Map<string, VendorAdvisoryEntry> = new Map(
	VENDOR_ADVISORIES.map((e) => [e.technologyKey, e]),
);

export function getVendorAdvisory(technologyKey: string): VendorAdvisoryEntry | null {
	return BY_KEY.get(technologyKey) ?? null;
}
