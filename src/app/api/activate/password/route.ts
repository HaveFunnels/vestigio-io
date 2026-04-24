import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { checkRateLimit } from "@/libs/limiter";

// ──────────────────────────────────────────────
// POST /api/activate/password
//
// Password branch of the /activate/:token flow. Consumes the token
// and sets a hashed password on the pending User, activating them.
//
// Body: { token: string, password: string }
//
// On success: 200 with { email } — client redirects to /auth/signin
// pre-filled with the email. We don't mint a session directly here
// because NextAuth's JWT session is created via the credentials
// provider signin path, and duplicating that path's JWT generation
// server-side is brittle. One extra click at /auth/signin is fine UX.
//
// Mirrors password rules from the public signup endpoint so the
// experience is consistent for returning users.
// ──────────────────────────────────────────────

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 72; // bcrypt hard limit

export const POST = withErrorTracking(
	async function POST(req: NextRequest) {
		// Rate limit: 5 attempts per IP per minute
		const limited = await checkRateLimit(5, 60000);
		if (limited) return limited;

		let body: { token?: unknown; password?: unknown };
		try {
			body = await req.json();
		} catch {
			return NextResponse.json({ message: "Invalid body." }, { status: 400 });
		}

		const token = typeof body.token === "string" ? body.token : null;
		const password = typeof body.password === "string" ? body.password : null;

		if (!token || !password) {
			return NextResponse.json(
				{ message: "Token and password are required." },
				{ status: 400 },
			);
		}
		if (password.length < MIN_PASSWORD_LEN) {
			return NextResponse.json(
				{ message: `Password must be at least ${MIN_PASSWORD_LEN} characters.` },
				{ status: 400 },
			);
		}
		if (password.length > MAX_PASSWORD_LEN) {
			return NextResponse.json(
				{ message: `Password must be at most ${MAX_PASSWORD_LEN} characters.` },
				{ status: 400 },
			);
		}

		const hashed = await bcrypt.hash(password, 10);

		// Atomic find-and-update: prevents race condition where two
		// concurrent requests both consume the same token.
		const pending = await prisma.user.updateMany({
			where: {
				activationToken: token,
				activationTokenExpiresAt: { gt: new Date() },
				activatedAt: null,
			},
			data: {
				password: hashed,
				emailVerified: new Date(),
				activatedAt: new Date(),
				activationToken: null,
				activationTokenExpiresAt: null,
			},
		});

		if (pending.count === 0) {
			// Token missing / expired / already consumed. Generic response.
			return NextResponse.json(
				{ message: "This activation link is no longer valid." },
				{ status: 410 },
			);
		}

		// Fetch email for response (token is already cleared)
		const activated = await prisma.user.findFirst({
			where: { activatedAt: { not: null }, password: hashed },
			select: { email: true },
			orderBy: { activatedAt: "desc" },
		});

		return NextResponse.json({
			email: activated?.email ?? "",
		});
	},
	{ endpoint: "/api/activate/password", method: "POST" },
);
