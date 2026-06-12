// ──────────────────────────────────────────────
// Vendor status pages — curated list
//
// Quando a Vestigio detecta um vendor crítico (Stripe, Pagar.me,
// Shopify, etc.) no stack do cliente, este mapa fornece o link
// direto pra status page pública. UI vira "🔗 Pagar.me status" sem
// o cliente ter que buscar onde fica.
//
// **Por que estático**: status pages mudam raramente (a-cada-anos).
// Polling delas pra detectar incidents é Wave futura (precisa
// scraping + parse + push de alerta) — por enquanto, link direto
// resolve o caso "cai meu pagamento, é fornecedor ou é meu código?"
// em 1 click.
//
// Key: `technology_key` do registry (packages/technology-registry/).
// Source: cada vendor — verificado 2026-06.
// ──────────────────────────────────────────────

export interface VendorStatusPage {
	/** URL direta pra status page pública */
	url: string;
	/** Label legível pra UI ("Stripe Status", "Pagar.me Status") */
	label: string;
}

export const VENDOR_STATUS_PAGES: Record<string, VendorStatusPage> = {
	// ── Payments ───────────────────────────────
	stripe: {
		url: "https://status.stripe.com",
		label: "Stripe Status",
	},
	paypal: {
		url: "https://status.paypal.com",
		label: "PayPal Status",
	},
	pagarme: {
		url: "https://status.pagar.me",
		label: "Pagar.me Status",
	},
	mercado_pago: {
		url: "https://status.mercadopago.com",
		label: "Mercado Pago Status",
	},
	paddle: {
		url: "https://status.paddle.com",
		label: "Paddle Status",
	},

	// ── Hosting / Platform ─────────────────────
	vercel: {
		url: "https://www.vercel-status.com",
		label: "Vercel Status",
	},
	shopify: {
		url: "https://www.shopifystatus.com",
		label: "Shopify Status",
	},
	cloudflare: {
		url: "https://www.cloudflarestatus.com",
		label: "Cloudflare Status",
	},
	netlify: {
		url: "https://www.netlifystatus.com",
		label: "Netlify Status",
	},
	aws: {
		url: "https://health.aws.amazon.com/health/status",
		label: "AWS Status",
	},

	// ── Analytics / Marketing ──────────────────
	google_analytics: {
		url: "https://www.google.com/appsstatus/dashboard/",
		label: "Google Analytics Status",
	},
	google_tag_manager: {
		url: "https://www.google.com/appsstatus/dashboard/",
		label: "Google Status",
	},
	facebook_pixel: {
		url: "https://www.metastatus.com",
		label: "Meta Status",
	},
	mixpanel: {
		url: "https://www.mixpanelstatus.com",
		label: "Mixpanel Status",
	},
	segment: {
		url: "https://status.segment.com",
		label: "Segment Status",
	},

	// ── Email ──────────────────────────────────
	sendgrid: {
		url: "https://status.sendgrid.com",
		label: "SendGrid Status",
	},
	mailchimp: {
		url: "https://status.mailchimp.com",
		label: "Mailchimp Status",
	},
	klaviyo: {
		url: "https://status.klaviyo.com",
		label: "Klaviyo Status",
	},
	brevo: {
		url: "https://status.brevo.com",
		label: "Brevo Status",
	},

	// ── Support / Chat ────────────────────────
	intercom: {
		url: "https://www.intercomstatus.com",
		label: "Intercom Status",
	},
	zendesk: {
		url: "https://status.zendesk.com",
		label: "Zendesk Status",
	},

	// ── Error tracking / CDN ──────────────────
	sentry: {
		url: "https://status.sentry.io",
		label: "Sentry Status",
	},
	hotjar: {
		url: "https://status.hotjar.com",
		label: "Hotjar Status",
	},
};
