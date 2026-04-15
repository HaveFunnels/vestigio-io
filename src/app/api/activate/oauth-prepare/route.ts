import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// POST /api/activate/oauth-prepare
//
// Bridge between /activate/:token and NextAuth's OAuth signin flow.
//
// Body: { token: string, provider: "google" | "github" }
//
// What it does:
//   1. Validate the activation token exists, isn't expired, isn't
//      already consumed
//   2. Set an httpOnly cookie `vestigio_activation_token={token}` with
//      a short TTL (90 seconds — just enough to survive the OAuth
//      round-trip; if the user abandons, it expires on its own)
//   3. Redirect the browser to NextAuth's signin endpoint for the
//      chosen provider with callbackUrl=/app
//
// The adapter override in src/libs/auth.ts reads this cookie during
// the post-OAuth createUser/getUserByEmail calls and links the new
// OAuth Account to the pending User instead of creating a fresh one.
//
// Why POST + redirect instead of GET: the token is tied to a real
// purchase, so changing auth state on a simple link click would let
// a phishing site or someone's browser extension trigger activation.
// POST also keeps the token out of referer headers during the OAuth
// redirect chain.
// ──────────────────────────────────────────────

const ACTIVATION_COOKIE_TTL_SECONDS = 90;
const ALLOWED_PROVIDERS = new Set(["google", "github"]);

export const POST = withErrorTracking(
	async function POST(req: NextRequest) {
		let body: { token?: unknown; provider?: unknown };
		try {
			body = await req.json();
		} catch {
			return NextResponse.json({ message: "Invalid body." }, { status: 400 });
		}

		const token = typeof body.token === "string" ? body.token : null;
		const provider = typeof body.provider === "string" ? body.provider.toLowerCase() : null;

		if (!token || !provider || !ALLOWED_PROVIDERS.has(provider)) {
			return NextResponse.json(
				{ message: "Invalid token or provider." },
				{ status: 400 },
			);
		}

		const pending = await prisma.user.findFirst({
			where: {
				activationToken: token,
				activationTokenExpiresAt: { gt: new Date() },
				activatedAt: null,
			},
			select: { id: true },
		});

		if (!pending) {
			// Token missing / expired / already consumed — indistinguishable
			// response to keep enumeration hard.
			return NextResponse.json(
				{ message: "This activation link is no longer valid." },
				{ status: 410 },
			);
		}

		const base =
			process.env.NEXTAUTH_URL ||
			process.env.NEXT_PUBLIC_APP_URL ||
			new URL(req.url).origin;
		const redirectUrl = `${base}/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(`${base}/app`)}`;

		const res = NextResponse.json({ redirect: redirectUrl }, { status: 200 });
		res.cookies.set("vestigio_activation_token", token, {
			httpOnly: true,
			sameSite: "lax", // must survive OAuth provider redirects
			secure: process.env.NODE_ENV === "production",
			maxAge: ACTIVATION_COOKIE_TTL_SECONDS,
			path: "/",
		});
		return res;
	},
	{ endpoint: "/api/activate/oauth-prepare", method: "POST" },
);
