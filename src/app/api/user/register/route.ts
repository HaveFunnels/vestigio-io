import { evaluateAlerts } from "@/libs/alert-evaluator";
import { withErrorTracking } from "@/libs/error-tracker";
import { checkRateLimit } from "@/libs/limiter";
import { prisma } from "@/libs/prismaDb";
import { verifyTurnstile } from "@/libs/turnstile";
import { excludeFields } from "@/utils/exclude-fields";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { recordSignupAttempt } from "@/libs/signup-telemetry";
import { registerSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	// Rate limit: 5 registrations per IP per 60 seconds
	const rateLimited = await checkRateLimit(5, 60000);
	if (rateLimited) {
		// No session id here: the body is not parsed yet, and parsing it
		// before the rate limit would let a flood allocate work.
		recordSignupAttempt({ outcome: "rate_limited" });
		return rateLimited;
	}

	const body = await request.json();
	// Attribution the form forwards from @/libs/marketing-session, so
	// an attempt can be joined to the campaign that produced it. Both
	// optional: a request from outside the form simply records none.
	const telemetry = {
		sessionId: (body as { sessionId?: string })?.sessionId ?? null,
		firstTouch: (body as { firstTouch?: Record<string, unknown> })?.firstTouch ?? null,
	};
	const res = registerSchema.safeParse(body);

	if (!res.success) {
		recordSignupAttempt({
			...telemetry,
			outcome: "invalid_payload",
			// Field names only. The values are the person's details.
			detail: Object.keys(res.error.flatten().fieldErrors).join(","),
		});
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	// Wave 18e P3.2 — Turnstile. Fail-open when TURNSTILE_SECRET_KEY
	// is unset (dev + staged rollout). Client widget must post the
	// token as `turnstileToken` alongside the register payload.
	const turnstile = await verifyTurnstile(
		(body as { turnstileToken?: string })?.turnstileToken,
	);
	if (!turnstile.ok) {
		// This is the branch that silently rejected every signup from
		// 2026-07-05 to 2026-10-16. It now leaves a record, with the
		// reason, so "missing_token" is visible the same day instead of
		// three months later as an absence of User rows.
		recordSignupAttempt({
			...telemetry,
			outcome: "captcha_failed",
			detail: turnstile.reason ?? null,
		});
		return NextResponse.json(
			{ message: "Captcha verification failed", reason: turnstile.reason },
			{ status: 400 },
		);
	}

	const { name, email, password } = res.data;

	const isUserRegistered = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserRegistered) {
		recordSignupAttempt({ ...telemetry, outcome: "already_registered" });
		return new NextResponse("Email already exists", { status: 409 });
	}

	const hashedPassword = await bcrypt.hash(password, 10);

	// Every self-service registration lands as USER. ADMIN promotion is
	// staff-only, done via the admin console with requireAdmin() DB-check.
	// The prior code auto-promoted to ADMIN when the submitted email
	// matched ADMIN_EMAILS — a race where any unclaimed listed email
	// (new hire added to env before signup) could be won by an
	// unauthenticated attacker: no email verification, no session gate,
	// no audit trail. Removed entirely.
	const newUser = {
		name,
		email,
		password: hashedPassword,
		role: "USER",
	};

	try {
		const user = await prisma.user.create({
			data: {
				...newUser,
			},
		});

		recordSignupAttempt({ ...telemetry, outcome: "created", userId: user.id });

		// Fire-and-forget: evaluate alert rules for new signups. Kept,
		// but it is not telemetry: it reads AlertRule, which has no rows
		// in production, so on its own it records nothing.
		evaluateAlerts("new_signup").catch(() => {});

		return NextResponse.json(
			{
				message: "User created successfully",
				data: excludeFields(user, [
					"password",
					"passwordResetToken",
					"passwordResetTokenExp",
				]),
			},
			{ status: 201 }
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Unknown error';
		recordSignupAttempt({ ...telemetry, outcome: "error", detail: msg.slice(0, 200) });
		return NextResponse.json({ message: msg }, { status: 500 });
	}
}, { endpoint: "/api/user/register", method: "POST" });
