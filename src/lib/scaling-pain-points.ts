/**
 * scaling-pain-points — Curated knowledge base of "what tends to
 * break first at scale" per technology vendor, used by Wave 11.3a
 * "What breaks at 10x" simulator.
 *
 * We curate explicit thresholds (rate limits, free-tier caps) rather
 * than pretend to model real throughput from inventory or pixel data.
 * If a vendor is missing here the simulator simply doesn't surface
 * it — better silent than confidently wrong.
 *
 * Source notes (verified 2026-05): all numbers come from each
 * vendor's public pricing/quota docs. Keep in sync as plans evolve.
 */

export type PainSeverity = "critical" | "high" | "medium" | "low";

export interface ScalingPainPoint {
	/** Short label shown in the bar */
	id: string;
	/** Severity tier — drives sort order + color */
	severity: PainSeverity;
	/** i18n key under `console.workspaces.detail.what_breaks_at_10x.points` */
	i18nKey: string;
}

/** Map technology_key → list of pain points. */
export const SCALING_PAIN_POINTS: Record<string, ScalingPainPoint[]> = {
	// ── Hosting ─────────────────────────────────
	vercel: [
		{ id: "vercel_hobby_bandwidth", severity: "critical", i18nKey: "vercel_hobby_bandwidth" },
		{ id: "vercel_edge_timeout", severity: "medium", i18nKey: "vercel_edge_timeout" },
		{ id: "vercel_function_cold_starts", severity: "medium", i18nKey: "vercel_function_cold_starts" },
	],
	netlify: [
		{ id: "netlify_starter_bandwidth", severity: "high", i18nKey: "netlify_starter_bandwidth" },
		{ id: "netlify_build_minutes", severity: "medium", i18nKey: "netlify_build_minutes" },
	],
	heroku: [
		{ id: "heroku_dyno_sleep", severity: "high", i18nKey: "heroku_dyno_sleep" },
	],
	shopify: [
		{ id: "shopify_api_rate_limit", severity: "medium", i18nKey: "shopify_api_rate_limit" },
		{ id: "shopify_checkout_extensibility", severity: "low", i18nKey: "shopify_checkout_extensibility" },
	],
	wordpress: [
		{ id: "wordpress_plugin_bloat", severity: "high", i18nKey: "wordpress_plugin_bloat" },
		{ id: "wordpress_db_query_volume", severity: "medium", i18nKey: "wordpress_db_query_volume" },
	],
	woocommerce: [
		{ id: "woocommerce_checkout_throughput", severity: "high", i18nKey: "woocommerce_checkout_throughput" },
	],

	// ── Payments ────────────────────────────────
	stripe: [
		{ id: "stripe_rate_limit", severity: "medium", i18nKey: "stripe_rate_limit" },
		{ id: "stripe_webhook_lag", severity: "medium", i18nKey: "stripe_webhook_lag" },
		{ id: "stripe_radar_review_queue", severity: "low", i18nKey: "stripe_radar_review_queue" },
	],
	paypal: [
		{ id: "paypal_dispute_volume", severity: "high", i18nKey: "paypal_dispute_volume" },
	],
	mercadopago: [
		{ id: "mercadopago_chargeback_threshold", severity: "high", i18nKey: "mercadopago_chargeback_threshold" },
	],

	// ── CDN ─────────────────────────────────────
	cloudflare: [
		{ id: "cloudflare_worker_cpu", severity: "medium", i18nKey: "cloudflare_worker_cpu" },
		{ id: "cloudflare_free_unmetered", severity: "low", i18nKey: "cloudflare_free_unmetered" },
	],
	fastly: [
		{ id: "fastly_request_rate", severity: "low", i18nKey: "fastly_request_rate" },
	],

	// ── Email ───────────────────────────────────
	sendgrid: [
		{ id: "sendgrid_free_daily", severity: "critical", i18nKey: "sendgrid_free_daily" },
		{ id: "sendgrid_ip_reputation", severity: "high", i18nKey: "sendgrid_ip_reputation" },
	],
	mailgun: [
		{ id: "mailgun_flex_limit", severity: "critical", i18nKey: "mailgun_flex_limit" },
	],
	klaviyo: [
		{ id: "klaviyo_active_profiles", severity: "high", i18nKey: "klaviyo_active_profiles" },
	],
	mailchimp: [
		{ id: "mailchimp_contact_pricing", severity: "high", i18nKey: "mailchimp_contact_pricing" },
	],
	hubspot: [
		{ id: "hubspot_marketing_contacts", severity: "high", i18nKey: "hubspot_marketing_contacts" },
	],

	// ── Error tracking ──────────────────────────
	sentry: [
		{ id: "sentry_event_quota", severity: "critical", i18nKey: "sentry_event_quota" },
		{ id: "sentry_replay_pricing", severity: "medium", i18nKey: "sentry_replay_pricing" },
	],
	datadog: [
		{ id: "datadog_host_pricing", severity: "high", i18nKey: "datadog_host_pricing" },
	],

	// ── Tag manager / analytics ─────────────────
	google_analytics: [
		{ id: "ga4_event_cap", severity: "low", i18nKey: "ga4_event_cap" },
		{ id: "ga4_sampling_threshold", severity: "medium", i18nKey: "ga4_sampling_threshold" },
	],
	facebook_pixel: [
		{ id: "facebook_pixel_match_quality", severity: "medium", i18nKey: "facebook_pixel_match_quality" },
	],
	hotjar: [
		{ id: "hotjar_session_cap", severity: "high", i18nKey: "hotjar_session_cap" },
	],

	// ── Support ─────────────────────────────────
	intercom: [
		{ id: "intercom_active_people_pricing", severity: "high", i18nKey: "intercom_active_people_pricing" },
	],
	zendesk: [
		{ id: "zendesk_agent_seat_pricing", severity: "medium", i18nKey: "zendesk_agent_seat_pricing" },
	],

	// ── A/B testing ─────────────────────────────
	optimizely: [
		{ id: "optimizely_mau_pricing", severity: "high", i18nKey: "optimizely_mau_pricing" },
	],
	launchdarkly: [
		{ id: "launchdarkly_mau_pricing", severity: "medium", i18nKey: "launchdarkly_mau_pricing" },
	],
};

export function getPainPoints(technologyKey: string): ScalingPainPoint[] {
	return SCALING_PAIN_POINTS[technologyKey] || [];
}
