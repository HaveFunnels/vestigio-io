import { withErrorTracking } from "@/libs/error-tracker";
import hashPassword from "@/libs/formatPassword";
import { checkRateLimit } from "@/libs/limiter";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { updatePasswordSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	// Rate limit: 5 attempts per IP per 60 seconds
	const rateLimited = await checkRateLimit(5, 60000);
	if (rateLimited) return rateLimited;

	const body = await request.json();
	const res = updatePasswordSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { email, password, token } = res.data;

	// Verify the reset token is valid, belongs to this email, and has not expired
	const user = await prisma.user.findUnique({
		where: {
			email,
			passwordResetToken: token,
			passwordResetTokenExp: {
				gte: new Date(),
			},
		},
	});

	if (!user) {
		return NextResponse.json(
			{ message: "Invalid or expired reset token" },
			{ status: 400 }
		);
	}

	const hashedPassword = await hashPassword(password);

	try {
		await prisma.user.update({
			where: { email },
			data: {
				password: hashedPassword,
				passwordResetToken: null,
				passwordResetTokenExp: null,
			},
		});

		return NextResponse.json({ message: "Password Updated" }, { status: 200 });
	} catch (error) {
		return NextResponse.json({ message: "Internal Error" }, { status: 500 });
	}
}, { endpoint: "/api/forgot-password/update", method: "POST" });
