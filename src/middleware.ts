import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { verifyExportTokenEdge } from "@/libs/strategy-export-token-edge";

// ──────────────────────────────────────────────
// Unified Middleware
//
// Domain model:
// - vestigio.io       → marketing (homepage, pricing, blog)
// - app.vestigio.io   → authenticated app (dashboard, chat, admin)
//
// Route model (on app.vestigio.io):
// - /app/*           → authenticated (any role)
// - /app/admin/*     → platform ADMIN only
// - /auth/*          → login/signup/reset (public)
//
// Auth pages on the marketing domain redirect to app domain.
// App routes on the marketing domain redirect to app domain.
// ──────────────────────────────────────────────

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "app.vestigio.io";
const MARKETING_DOMAIN = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || "vestigio.io";

/**
 * Returns true when the JWT token is present AND still within its
 * per-login sessionExpiresAt window. Wave 18d fix for an
 * ERR_TOO_MANY_REDIRECTS class of bugs introduced by the "Remember
 * me" feature (commit 3481594):
 *
 *   - Cookie maxAge is 30 days (the upper bound).
 *   - Per-login session lifetime is 12h (no remember) or 30d (remember).
 *   - When the per-login window elapses but the cookie hasn't, the
 *     server-side `session` callback in auth.ts returns an expired
 *     session with `user: {}` — but the raw JWT decoded by `getToken`
 *     (what withAuth gives us as `req.nextauth.token`) is still
 *     cryptographically valid.
 *   - Without this check, middleware sees `token` as truthy and treats
 *     the user as authenticated, while server-rendered pages see no
 *     user. The two views disagree and the UI can land in a redirect
 *     loop (e.g. /auth/signin → middleware redirects to /app because
 *     "token exists" → /app shows logged-out state → client redirects
 *     to /auth/signin → repeat).
 *
 * Legacy tokens without sessionExpiresAt are treated as valid so
 * existing logins from before commit 3481594 don't break.
 */
function hasValidSession(token: unknown): boolean {
	if (!token || typeof token !== "object") return false;
	const expiresAt = (token as { sessionExpiresAt?: number | null }).sessionExpiresAt;
	if (typeof expiresAt !== "number") return true; // legacy / not set
	return Date.now() < expiresAt;
}

/**
 * Strip the port (if any) and lowercase the host header. Host headers
 * are case-insensitive per RFC 7230 §5.4 and dev / Railway URLs can
 * arrive with mixed case (e.g. `APP.VESTIGIO.IO`) so every comparison
 * below has to go through this normalization first.
 */
function normalizeHost(host: string): string {
	return (host || "").split(":")[0].toLowerCase();
}

/**
 * Wave 18e — exact-match host validation. Previous version used
 * `host.startsWith(APP_DOMAIN)` which matched `app.vestigio.io.evil.com`,
 * `host.includes(".up.railway.app")` which matched
 * `evil.com/.up.railway.app/wat` as substring, and
 * `host.startsWith("localhost")` which matched `localhost.attacker.com`.
 * Each was a host-header-injection vector that could trick the
 * middleware into treating an attacker-controlled origin as the app
 * domain — relevant if a misconfigured upstream proxy ever forwarded
 * an arbitrary Host header to us.
 */
function isAppDomain(host: string): boolean {
	const h = normalizeHost(host);
	if (!h) return false;
	if (h === APP_DOMAIN) return true;
	// Dev: bare `localhost` (port already stripped above).
	if (h === "localhost") return true;
	// Railway-generated preview URLs end with `.up.railway.app` — must
	// be anchored so we don't match an attacker-suffixed host.
	if (h.endsWith(".up.railway.app")) return true;
	return false;
}

function isMarketingDomain(host: string): boolean {
	const h = normalizeHost(host);
	return h === MARKETING_DOMAIN || h === `www.${MARKETING_DOMAIN}`;
}

function appUrl(path: string, req: NextRequestWithAuth): URL {
	// In production, redirect to app.vestigio.io
	// In dev / Railway preview, use the current host
	const host = req.headers.get("host") || "";
	if (isAppDomain(host)) {
		return new URL(path, req.url);
	}
	const protocol = req.nextUrl.protocol || "https:";
	return new URL(`${protocol}//${APP_DOMAIN}${path}`);
}

export default withAuth(
	function middleware(req: NextRequestWithAuth) {
		const pathname = req.nextUrl?.pathname;
		const host = req.headers.get("host") || "";
		// Wave 18d — treat per-login-expired JWTs as logged out for
		// every middleware decision below. Without this the auth pages
		// redirect users into /app (because token is cryptographically
		// valid) while the app pages render the logged-out shell
		// (because session callback returns expires=epoch), producing
		// an ERR_TOO_MANY_REDIRECTS loop.
		const sessionValid = hasValidSession(req.nextauth.token);
		const tokenForAuth = sessionValid ? req.nextauth.token : null;
		const isAdmin = sessionValid && req.nextauth.token?.role === "ADMIN";

		// ── Domain routing ──────────────────────────
		// Marketing domain: redirect auth/app routes to app domain
		if (isMarketingDomain(host)) {
			if (
				pathname.startsWith("/app") ||
				pathname.startsWith("/auth") ||
				pathname.startsWith("/user") ||
				pathname.startsWith("/admin")
			) {
				return NextResponse.redirect(appUrl(pathname, req));
			}
			// Marketing pages — let through
			return NextResponse.next();
		}

		// ── Sanity Studio: ADMIN only ──────────────────
		if (pathname.startsWith("/studio")) {
			if (!tokenForAuth) {
				return NextResponse.redirect(new URL("/auth/signin", req.url));
			}
			if (tokenForAuth.role !== "ADMIN") {
				return NextResponse.redirect(new URL("/", req.url));
			}
			return NextResponse.next();
		}

		// ── Authenticated user on auth pages → redirect to /app ──
		if (isAppDomain(host) && pathname.startsWith("/auth/") && tokenForAuth) {
			return NextResponse.redirect(new URL("/app", req.url));
		}

		// ── App domain root ─────────────────────────
		// app.vestigio.io/ (root) → redirect to /app (auth required)
		// or /auth/signin if not authenticated
		if (isAppDomain(host) && (pathname === "/" || pathname === "")) {
			if (!tokenForAuth) {
				return NextResponse.redirect(new URL("/auth/signin", req.url));
			}
			return NextResponse.redirect(new URL("/app", req.url));
		}

		// ── Legacy redirects (app domain) ───────────

		// Wave 3.20: /app/analysis → /app/findings (301, preserves query params)
		if (pathname === "/app/analysis" || pathname === "/app/analysis/") {
			const url = new URL("/app/findings", req.url);
			url.search = req.nextUrl.search; // preserve ?severity=, etc.
			return NextResponse.redirect(url, 301);
		}

		// /user root → /app
		if (pathname === "/user" || pathname === "/user/") {
			return NextResponse.redirect(new URL("/app", req.url));
		}

		// /admin root → /app/admin (if admin) or /app (if not)
		if (pathname === "/admin" || pathname === "/admin/") {
			return NextResponse.redirect(new URL(isAdmin ? "/app/admin/overview" : "/app", req.url));
		}

		// ── System Admin vs User routing ─────────────
		// System Admin: manages the Vestigio platform. Not a customer.
		//   No org, no onboarding, no analysis. Goes to /app/admin/*.
		// User: customer of Vestigio. Has org, does onboarding, audits domains.

		// System admin hitting /app (root) → send to admin dashboard
		if (isAdmin && (pathname === "/app" || pathname === "/app/")) {
			return NextResponse.redirect(new URL("/app/admin/overview", req.url));
		}

		// /app/admin/* → system admin only
		if (pathname.startsWith("/app/admin")) {
			if (!isAdmin) {
				return NextResponse.redirect(new URL("/app", req.url));
			}
			// Admin accessing admin pages — always allowed, no org needed
			return NextResponse.next();
		}

		// System admin trying to access user pages (analysis, chat, etc.)
		// → redirect to admin dashboard (admin is not a customer)
		if (isAdmin && pathname.startsWith("/app") && !pathname.startsWith("/app/admin")) {
			return NextResponse.redirect(new URL("/app/admin/overview", req.url));
		}

		// Legacy /admin/* pages (boilerplate) → system admin only
		if (pathname.startsWith("/admin/") && !isAdmin) {
			return NextResponse.redirect(new URL("/app", req.url));
		}

		// ── Onboarding gate (users only) ────────────
		// Users without an active org must complete onboarding first.
		const hasOrganization = tokenForAuth?.hasOrganization;
		// Wave 5 Fase 2: admin-provisioned "shell" orgs have a membership but
		// no activated environment. Route them through onboarding too so the
		// owner contributes env + business profile + triggers the first audit
		// cycle, rather than landing in an empty dashboard.
		const hasActivatedEnv = tokenForAuth?.hasActivatedEnv;
		const needsOnboarding =
			hasOrganization === false || hasActivatedEnv === false;
		if (
			pathname.startsWith("/app") &&
			!pathname.startsWith("/app/onboarding") &&
			needsOnboarding
		) {
			return NextResponse.redirect(new URL("/app/onboarding", req.url));
		}

		// Legacy /user/* pages (boilerplate) → any authenticated (keep for billing portal)

		// Wave 22 Fase B+ — forward the request pathname as a header so
		// server components can read it. Next.js doesn't expose pathname
		// natively to layout.tsx; this is the standard workaround. Used
		// by /app/layout.tsx to detect "user is on an inactive env"
		// without infinite-looping the onboarding redirect.
		//
		// IMPORTANT: must be set on the REQUEST headers (not response)
		// so it propagates to RSC handlers; NextResponse.next({ request })
		// is the Next 13.5+ pattern.
		const requestHeaders = new Headers(req.headers);
		requestHeaders.set("x-pathname", pathname);
		return NextResponse.next({ request: { headers: requestHeaders } });
	},
	{
		secret: process.env.SECRET,
		callbacks: {
			authorized: async (params) => {
				const { req } = params;
				const { token } = params;
				const pathname = req.nextUrl?.pathname;

				const host = req.headers.get("host") || "";

				// Marketing domain pages don't require auth
				if (isMarketingDomain(host)) {
					if (!pathname.startsWith("/app") && !pathname.startsWith("/admin") && !pathname.startsWith("/user")) {
						return true;
					}
				}

				// Auth pages are public
				if (pathname.startsWith("/auth/")) return true;

				// Studio — let through to middleware function (it checks ADMIN)
				if (pathname.startsWith("/studio")) return true;

				// PDF-export self-request: puppeteer (no session cookie)
				// hits /app/library/strategy/[month]?print=true&export_token=<sig>
				// to render the plan for capture. Without this gate withAuth
				// redirects the cookie-less request to /auth/signin and the
				// captured PDF is a black login page.
				//
				// Security: HMAC-verified end-to-end against NEXTAUTH_SECRET
				// via crypto.subtle.verify (constant-time). The token's 90s
				// TTL bounds blast radius. No trust placed in Host or any
				// other spoofable request header — anyone holding a valid
				// signed token may render the page, which is the same trust
				// model the downstream API uses.
				if (
					pathname.startsWith("/app/library/strategy/") &&
					req.nextUrl?.searchParams.get("print") === "true"
				) {
					const exportToken = req.nextUrl.searchParams.get("export_token");
					if (exportToken) {
						const verified = await verifyExportTokenEdge(exportToken);
						if (verified) return true;
					}
				}

				// App domain root — allow through so middleware function can handle redirect
				if (pathname === "/" || pathname === "") return true;

				// Wave 18d — gate on hasValidSession (not just !!token) so a
				// per-login-expired JWT (cookie still cryptographically valid
				// but past sessionExpiresAt) is treated as logged-out here too.
				// If we return true for an expired token, withAuth lets the
				// request through; the middleware function then redirects
				// to /app while the page renders the logged-out shell ⇒ loop.
				return hasValidSession(token);
			},
		},
	}
);

export const config = {
	matcher: [
		// Root path (app domain redirect)
		"/",
		// Unified app shell
		"/app/:path*",
		// Auth pages (need middleware for domain routing)
		"/auth/:path*",
		// Legacy routes still in use: billing portal lives under /user,
		// boilerplate admin pages live under /admin (both redirect to
		// /app/* inside the middleware function).
		"/user/:path*",
		"/admin/:path*",
		// Sanity Studio (admin-protected)
		"/studio/:path*",
		// Wave 18e cleanup — removed the never-redirecting matchers for
		// /analysis, /actions, /workspaces, /chat, /maps, /settings,
		// /onboard. Those paths existed in an earlier console layout but
		// the current app namespaces everything under /app/*; leaving
		// them in the matcher meant middleware ran on every 404 against
		// those URLs for no functional reason. If a customer keeps a
		// pre-Wave-3 bookmark to /workspaces/<id>, they now hit a 404
		// directly instead of paying middleware overhead first. Add a
		// redirect rule here if that becomes a real complaint.
	],
};
