import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

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

function isAppDomain(host: string): boolean {
	// Match app.vestigio.io, app.vestigio.io:3000, localhost, Railway generated domain
	return (
		host.startsWith(`${APP_DOMAIN}`) ||
		host.startsWith("localhost") ||
		host.includes(".up.railway.app")
	);
}

function isMarketingDomain(host: string): boolean {
	// Match vestigio.io (no subdomain) or www.vestigio.io
	const stripped = host.split(":")[0]; // remove port
	return (
		stripped === MARKETING_DOMAIN ||
		stripped === `www.${MARKETING_DOMAIN}`
	);
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
		const isAdmin = req.nextauth.token?.role === "ADMIN";

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

		// ── Legacy redirects (app domain) ───────────

		// /user root → /app
		if (pathname === "/user" || pathname === "/user/") {
			return NextResponse.redirect(new URL("/app", req.url));
		}

		// /admin root → /app/admin (if admin) or /app (if not)
		if (pathname === "/admin" || pathname === "/admin/") {
			return NextResponse.redirect(new URL(isAdmin ? "/app/admin/overview" : "/app", req.url));
		}

		// Old console routes → /app equivalents
		const consoleRedirects: Record<string, string> = {
			"/analysis": "/app/analysis",
			"/chat": "/app/chat",
			"/actions": "/app/actions",
			"/workspaces": "/app/workspaces",
			"/maps": "/app/maps",
			"/onboard": "/app/onboarding",
			"/settings": "/app/settings",
		};
		for (const [from, to] of Object.entries(consoleRedirects)) {
			if (pathname === from || pathname === from + "/") {
				return NextResponse.redirect(new URL(to, req.url));
			}
		}

		// ── Authorization ────────────────────────────

		// /app/admin/* → platform ADMIN only
		if (pathname.startsWith("/app/admin")) {
			if (!isAdmin) {
				return NextResponse.redirect(new URL("/app", req.url));
			}
		}

		// Legacy /admin/* pages (boilerplate) → ADMIN only
		if (pathname.startsWith("/admin/") && !isAdmin) {
			return NextResponse.redirect(new URL("/app", req.url));
		}

		// ── Onboarding gate ─────────────────────────
		// Users without an active org must complete onboarding first.
		// Exceptions: /app/onboarding itself, admin pages, platform admins.
		const hasOrganization = req.nextauth.token?.hasOrganization;
		if (
			pathname.startsWith("/app") &&
			!pathname.startsWith("/app/onboarding") &&
			!pathname.startsWith("/app/admin") &&
			!isAdmin &&
			hasOrganization === false
		) {
			return NextResponse.redirect(new URL("/app/onboarding", req.url));
		}

		// Legacy /user/* pages (boilerplate) → any authenticated (keep for billing portal)

		return NextResponse.next();
	},
	{
		secret: process.env.SECRET,
		callbacks: {
			authorized: (params) => {
				const { req } = params;
				const { token } = params;
				const pathname = req.nextUrl?.pathname;

				// Marketing pages don't require auth
				const host = req.headers.get("host") || "";
				if (isMarketingDomain(host)) {
					// Only require auth for /app and /admin routes on marketing domain
					// (they'll be redirected to app domain anyway)
					if (!pathname.startsWith("/app") && !pathname.startsWith("/admin") && !pathname.startsWith("/user")) {
						return true;
					}
				}

				// Auth pages are public
				if (pathname.startsWith("/auth/")) return true;

				// Everything else requires a token
				return !!token;
			},
		},
	}
);

export const config = {
	matcher: [
		// Unified app shell
		"/app/:path*",
		// Auth pages (need middleware for domain routing)
		"/auth/:path*",
		// Legacy routes (redirect or protect)
		"/user/:path*",
		"/admin/:path*",
		// Old console routes (redirect)
		"/analysis/:path*",
		"/actions/:path*",
		"/workspaces/:path*",
		"/chat/:path*",
		"/maps/:path*",
		"/settings/:path*",
		"/onboard/:path*",
	],
};
