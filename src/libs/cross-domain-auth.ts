// ──────────────────────────────────────────────
// Cross-domain-aware auth URL helper.
//
// Marketing surfaces (rendered on vestigio.io) that Link to /auth/*
// need an absolute URL to the app domain (app.vestigio.io). Middleware
// redirects /auth/* to the app domain, but Next.js Link auto-prefetches
// the RSC payload — the prefetch would follow the cross-domain 30x
// and fail CORS because app.vestigio.io does not send
// Access-Control-Allow-Origin for the marketing origin. Symptom:
// console spam "Failed to fetch RSC payload... Falling back to browser
// navigation" on every marketing page load, plus a wasted round trip.
// Fix: absolute app-domain href — Next.js Link never RSC-prefetches
// external hrefs.
//
// In dev NEXT_PUBLIC_APP_DOMAIN is unset → AUTH_BASE is "" → hrefs
// stay relative and the redirect path isn't in play (single-domain).
// ──────────────────────────────────────────────

export const AUTH_BASE = process.env.NEXT_PUBLIC_APP_DOMAIN
	? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`
	: "";

export function authHref(path: string): string {
	return `${AUTH_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
