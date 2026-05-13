/**
 * status-pages — Mapping from technology-registry keys to public
 * status page endpoints for Wave 11.3e Third-party Dependency Health.
 *
 * Most major SaaS run Atlassian Statuspage which exposes a uniform
 * JSON at `<root>/api/v2/status.json`. We curate only verified URLs
 * here. Services without a public status endpoint are left out and
 * the UI shows them as "status not available" rather than guessing.
 */

export interface StatusPageEntry {
	/** Canonical key from packages/technology-registry/registry.ts */
	technologyKey: string;
	/** Display label (fallback if registry display_name is missing) */
	displayName: string;
	/** Atlassian Statuspage `api/v2/status.json` URL */
	apiUrl: string;
	/** Human-facing status page URL (link from the UI row) */
	publicUrl: string;
}

export const STATUS_PAGES: StatusPageEntry[] = [
	// Payments
	{ technologyKey: "stripe", displayName: "Stripe", apiUrl: "https://status.stripe.com/api/v2/status.json", publicUrl: "https://status.stripe.com" },
	{ technologyKey: "paypal", displayName: "PayPal", apiUrl: "https://www.paypal-status.com/api/v2/status.json", publicUrl: "https://www.paypal-status.com" },
	{ technologyKey: "braintree", displayName: "Braintree", apiUrl: "https://status.braintreepayments.com/api/v2/status.json", publicUrl: "https://status.braintreepayments.com" },
	{ technologyKey: "mercadopago", displayName: "Mercado Pago", apiUrl: "https://status.mercadopago.com/api/v2/status.json", publicUrl: "https://status.mercadopago.com" },
	{ technologyKey: "square", displayName: "Square", apiUrl: "https://www.issquareup.com/api/v2/status.json", publicUrl: "https://www.issquareup.com" },
	{ technologyKey: "adyen", displayName: "Adyen", apiUrl: "https://status.adyen.com/api/v2/status.json", publicUrl: "https://status.adyen.com" },

	// Platforms / hosting
	{ technologyKey: "shopify", displayName: "Shopify", apiUrl: "https://www.shopifystatus.com/api/v2/status.json", publicUrl: "https://www.shopifystatus.com" },
	{ technologyKey: "vercel", displayName: "Vercel", apiUrl: "https://www.vercel-status.com/api/v2/status.json", publicUrl: "https://www.vercel-status.com" },
	{ technologyKey: "netlify", displayName: "Netlify", apiUrl: "https://www.netlifystatus.com/api/v2/status.json", publicUrl: "https://www.netlifystatus.com" },
	{ technologyKey: "heroku", displayName: "Heroku", apiUrl: "https://status.heroku.com/api/v2/status.json", publicUrl: "https://status.heroku.com" },

	// CDN
	{ technologyKey: "cloudflare", displayName: "Cloudflare", apiUrl: "https://www.cloudflarestatus.com/api/v2/status.json", publicUrl: "https://www.cloudflarestatus.com" },
	{ technologyKey: "fastly", displayName: "Fastly", apiUrl: "https://status.fastly.com/api/v2/status.json", publicUrl: "https://status.fastly.com" },

	// Email
	{ technologyKey: "sendgrid", displayName: "SendGrid", apiUrl: "https://status.sendgrid.com/api/v2/status.json", publicUrl: "https://status.sendgrid.com" },
	{ technologyKey: "mailgun", displayName: "Mailgun", apiUrl: "https://status.mailgun.com/api/v2/status.json", publicUrl: "https://status.mailgun.com" },
	{ technologyKey: "klaviyo", displayName: "Klaviyo", apiUrl: "https://status.klaviyo.com/api/v2/status.json", publicUrl: "https://status.klaviyo.com" },
	{ technologyKey: "mailchimp", displayName: "Mailchimp", apiUrl: "https://status.mailchimp.com/api/v2/status.json", publicUrl: "https://status.mailchimp.com" },
	{ technologyKey: "hubspot", displayName: "HubSpot", apiUrl: "https://status.hubspot.com/api/v2/status.json", publicUrl: "https://status.hubspot.com" },

	// Error tracking / observability
	{ technologyKey: "sentry", displayName: "Sentry", apiUrl: "https://status.sentry.io/api/v2/status.json", publicUrl: "https://status.sentry.io" },
	{ technologyKey: "datadog", displayName: "Datadog", apiUrl: "https://status.datadoghq.com/api/v2/status.json", publicUrl: "https://status.datadoghq.com" },

	// Support widgets
	{ technologyKey: "intercom", displayName: "Intercom", apiUrl: "https://www.intercomstatus.com/api/v2/status.json", publicUrl: "https://www.intercomstatus.com" },
	{ technologyKey: "zendesk", displayName: "Zendesk", apiUrl: "https://status.zendesk.com/api/v2/status.json", publicUrl: "https://status.zendesk.com" },

	// Tag managers / analytics infra (these don't have public Atlassian status pages —
	// Google Tag Manager status lives in Google Workspace status, not aggregated here)

	// Consent
	{ technologyKey: "onetrust", displayName: "OneTrust", apiUrl: "https://status.onetrust.com/api/v2/status.json", publicUrl: "https://status.onetrust.com" },

	// A/B testing
	{ technologyKey: "optimizely", displayName: "Optimizely", apiUrl: "https://status.optimizely.com/api/v2/status.json", publicUrl: "https://status.optimizely.com" },
	{ technologyKey: "launchdarkly", displayName: "LaunchDarkly", apiUrl: "https://status.launchdarkly.com/api/v2/status.json", publicUrl: "https://status.launchdarkly.com" },
];

const BY_KEY: Map<string, StatusPageEntry> = new Map(STATUS_PAGES.map((e) => [e.technologyKey, e]));

export function getStatusPage(technologyKey: string): StatusPageEntry | null {
	return BY_KEY.get(technologyKey) ?? null;
}
