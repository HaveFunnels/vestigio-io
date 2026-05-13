/**
 * vendor-pricing — Curated baseline pricing per vendor for the
 * Wave 11.3c "Budget forecast at projected scale" widget.
 *
 * Numbers are intentionally CONSERVATIVE midpoints sampled from each
 * vendor's standard plan as of 2026-05. The point isn't a precise bill
 * estimate — it's the order of magnitude so a founder can answer
 * "what's my infra burn at 5x scale?" without doing 20 sign-up flows.
 *
 * We model three growth scenarios:
 *   - now     → typical small-business tier (the plan most detected
 *               users land on after the free tier)
 *   - 5x      → mid-business tier (when usage outgrows starter)
 *   - 10x     → enterprise-adjacent tier (where pricing typically
 *               jumps to "talk to sales" — we publish a representative
 *               public price or a documented mid-enterprise quote)
 *
 * If a vendor is missing here, the simulator simply doesn't surface
 * it — better silent than confidently wrong about cost.
 */

export interface VendorPricing {
	/** monthly USD at the customer's likely current scale */
	nowUsd: number;
	/** monthly USD at 5x growth */
	at5xUsd: number;
	/** monthly USD at 10x growth */
	at10xUsd: number;
	/** Short human label for the "now" tier (Free, Starter, Pro, etc.) */
	tierLabelNow: string;
	tierLabel5x: string;
	tierLabel10x: string;
}

export const VENDOR_PRICING: Record<string, VendorPricing> = {
	// ── Hosting ─────────────────────────────────
	vercel: {
		nowUsd: 20, at5xUsd: 80, at10xUsd: 250,
		tierLabelNow: "Pro", tierLabel5x: "Pro + usage", tierLabel10x: "Enterprise",
	},
	netlify: {
		nowUsd: 19, at5xUsd: 99, at10xUsd: 300,
		tierLabelNow: "Pro", tierLabel5x: "Business", tierLabel10x: "Enterprise",
	},
	heroku: {
		nowUsd: 25, at5xUsd: 150, at10xUsd: 500,
		tierLabelNow: "Standard 1X", tierLabel5x: "Performance M", tierLabel10x: "Performance L cluster",
	},
	shopify: {
		nowUsd: 39, at5xUsd: 105, at10xUsd: 399,
		tierLabelNow: "Basic", tierLabel5x: "Shopify", tierLabel10x: "Advanced",
	},
	woocommerce: {
		nowUsd: 30, at5xUsd: 100, at10xUsd: 300,
		tierLabelNow: "Hosting + plugins", tierLabel5x: "Managed WP", tierLabel10x: "Dedicated WP cluster",
	},

	// ── Payments (fixed-cost portion; processing fees scale w/ revenue) ──
	stripe: {
		nowUsd: 0, at5xUsd: 0, at10xUsd: 0,
		tierLabelNow: "Standard 2.9%+30¢", tierLabel5x: "Standard 2.9%+30¢", tierLabel10x: "Custom volume",
	},
	paypal: {
		nowUsd: 0, at5xUsd: 0, at10xUsd: 0,
		tierLabelNow: "Standard 3.49%+49¢", tierLabel5x: "Standard 3.49%+49¢", tierLabel10x: "Negotiated rate",
	},

	// ── CDN ─────────────────────────────────────
	cloudflare: {
		nowUsd: 0, at5xUsd: 20, at10xUsd: 200,
		tierLabelNow: "Free", tierLabel5x: "Pro", tierLabel10x: "Business",
	},
	fastly: {
		nowUsd: 50, at5xUsd: 250, at10xUsd: 1000,
		tierLabelNow: "Pay-as-you-go", tierLabel5x: "Mid-volume", tierLabel10x: "Enterprise",
	},

	// ── Email ───────────────────────────────────
	sendgrid: {
		nowUsd: 20, at5xUsd: 90, at10xUsd: 250,
		tierLabelNow: "Essentials 50k", tierLabel5x: "Pro 100k", tierLabel10x: "Pro 1.5M",
	},
	mailgun: {
		nowUsd: 15, at5xUsd: 90, at10xUsd: 350,
		tierLabelNow: "Foundation 10k", tierLabel5x: "Foundation 100k", tierLabel10x: "Growth 500k",
	},
	klaviyo: {
		nowUsd: 45, at5xUsd: 200, at10xUsd: 720,
		tierLabelNow: "5k profiles", tierLabel5x: "25k profiles", tierLabel10x: "100k profiles",
	},
	mailchimp: {
		nowUsd: 35, at5xUsd: 150, at10xUsd: 525,
		tierLabelNow: "Standard 5k", tierLabel5x: "Standard 25k", tierLabel10x: "Premium 100k",
	},
	hubspot: {
		nowUsd: 50, at5xUsd: 800, at10xUsd: 3200,
		tierLabelNow: "Marketing Starter", tierLabel5x: "Marketing Pro", tierLabel10x: "Marketing Enterprise",
	},

	// ── Error tracking / observability ──────────
	sentry: {
		nowUsd: 26, at5xUsd: 80, at10xUsd: 400,
		tierLabelNow: "Team", tierLabel5x: "Business", tierLabel10x: "Business + scale",
	},
	datadog: {
		nowUsd: 90, at5xUsd: 450, at10xUsd: 1800,
		tierLabelNow: "Pro 5 hosts", tierLabel5x: "Enterprise 25 hosts", tierLabel10x: "Enterprise 100 hosts",
	},

	// ── Analytics ───────────────────────────────
	google_analytics: {
		nowUsd: 0, at5xUsd: 0, at10xUsd: 0,
		tierLabelNow: "GA4 Free", tierLabel5x: "GA4 Free", tierLabel10x: "GA360 (~$150k/yr if needed)",
	},
	hotjar: {
		nowUsd: 39, at5xUsd: 99, at10xUsd: 213,
		tierLabelNow: "Plus", tierLabel5x: "Business", tierLabel10x: "Scale",
	},

	// ── Support ─────────────────────────────────
	intercom: {
		nowUsd: 74, at5xUsd: 400, at10xUsd: 1500,
		tierLabelNow: "Essential 1 seat", tierLabel5x: "Advanced 5 seats", tierLabel10x: "Expert + AI",
	},
	zendesk: {
		nowUsd: 55, at5xUsd: 295, at10xUsd: 1140,
		tierLabelNow: "Suite Team 1 agent", tierLabel5x: "Suite Growth 5 agents", tierLabel10x: "Suite Pro 15 agents",
	},

	// ── A/B testing ─────────────────────────────
	optimizely: {
		nowUsd: 500, at5xUsd: 2000, at10xUsd: 5000,
		tierLabelNow: "Essentials", tierLabel5x: "Business", tierLabel10x: "Enterprise",
	},
	launchdarkly: {
		nowUsd: 12, at5xUsd: 60, at10xUsd: 240,
		tierLabelNow: "Starter 1 seat", tierLabel5x: "Pro 5 seats", tierLabel10x: "Enterprise",
	},

	// ── Consent ─────────────────────────────────
	onetrust: {
		nowUsd: 99, at5xUsd: 500, at10xUsd: 2000,
		tierLabelNow: "Cookie Compliance Basic", tierLabel5x: "Pro tier", tierLabel10x: "Enterprise",
	},
};

export function getVendorPricing(technologyKey: string): VendorPricing | null {
	return VENDOR_PRICING[technologyKey] ?? null;
}
