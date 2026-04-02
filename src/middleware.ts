import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Unified Middleware
//
// Route model:
// - /app/*           → authenticated (any role)
// - /app/admin/*     → platform ADMIN only
// - /user            → redirect to /app
// - /admin           → redirect to /app/admin/overview (if admin)
// - /(console) routes → redirect to /app equivalents
//
// Legacy /user and /admin routes remain for boilerplate
// pages that are still needed (auth, billing portal).
// ──────────────────────────────────────────────

export default withAuth(
	function middleware(req: NextRequestWithAuth) {
		const pathname = req.nextUrl?.pathname;
		const isAdmin = req.nextauth.token?.role === "ADMIN";

		// ── Legacy redirects ────────────────────────────

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
				const { token } = params;
				return !!token;
			},
		},
	}
);

export const config = {
	matcher: [
		// Unified app shell
		"/app/:path*",
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
