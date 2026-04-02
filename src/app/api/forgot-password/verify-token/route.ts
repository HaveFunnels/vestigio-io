import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { excludeFields } from "@/utils/exclude-fields";
import { NextResponse } from "next/server";
import { verifyTokenSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const body = await request.json();
	const res = verifyTokenSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const user = await prisma.user.findUnique({
		where: {
			passwordResetToken: res.data.token,
			passwordResetTokenExp: {
				gte: new Date(),
			},
		},
	});

	if (!user) {
		return NextResponse.json(
			{ message: "Invalid or expired token" },
			{ status: 400 }
		);
	}

	return NextResponse.json(
		excludeFields(user, [
			"password",
			"passwordResetToken",
			"passwordResetTokenExp",
		])
	);
}, { endpoint: "/api/forgot-password/verify-token", method: "POST" });
