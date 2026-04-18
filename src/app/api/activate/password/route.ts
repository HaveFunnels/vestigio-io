import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

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

		const pending = await prisma.user.findFirst({
			where: {
				activationToken: token,
				activationTokenExpiresAt: { gt: new Date() },
				activatedAt: null,
			},
		});

		if (!pending) {
			// Token missing / expired / already consumed. Generic response.
			return NextResponse.json(
				{ message: "This activation link is no longer valid." },
				{ status: 410 },
			);
		}

		const hashed = await bcrypt.hash(password, 10);

		await prisma.user.update({
			where: { id: pending.id },
			data: {
				password: hashed,
				emailVerified: new Date(),
				activatedAt: new Date(),
				activationToken: null,
				activationTokenExpiresAt: null,
			},
		});

		return NextResponse.json({
			email: pending.email,
		});
	},
	{ endpoint: "/api/activate/password", method: "POST" },
);
