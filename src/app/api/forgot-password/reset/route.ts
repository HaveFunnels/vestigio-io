import { withErrorTracking } from "@/libs/error-tracker";
import { checkRateLimit } from "@/libs/limiter";
import { prisma } from "@/libs/prismaDb";
import { sendPasswordResetEmail } from "@/libs/notification-triggers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { resetPasswordSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	// Rate limit: 3 reset requests per IP per 60 seconds
	const rateLimited = await checkRateLimit(3, 60000);
	if (rateLimited) return rateLimited;

	const body = await request.json();
	const res = resetPasswordSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { email } = res.data;

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		// Return success even if user doesn't exist to prevent email enumeration
		return NextResponse.json(
			{ message: "An email has been sent to your email" },
			{ status: 200 }
		);
	}

	const resetToken = crypto.randomBytes(20).toString("hex");

	const passwordResetTokenExp = new Date();
	passwordResetTokenExp.setMinutes(passwordResetTokenExp.getMinutes() + 10);

	await prisma.user.update({
		where: { email },
		data: {
			passwordResetToken: resetToken,
			passwordResetTokenExp,
		},
	});

	const resetURL = `${process.env.SITE_URL}/auth/reset-password/${resetToken}`;

	try {
		await sendPasswordResetEmail(user.id, email, resetURL);

		return NextResponse.json(
			{ message: "An email has been sent to your email" },
			{
				status: 200,
			}
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "An error occurred. Please try again!" },
			{
				status: 500,
			}
		);
	}
}, { endpoint: "/api/forgot-password/reset", method: "POST" });
