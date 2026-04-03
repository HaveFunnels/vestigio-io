import { evaluateAlerts } from "@/libs/alert-evaluator";
import { withErrorTracking } from "@/libs/error-tracker";
import { checkRateLimit } from "@/libs/limiter";
import { prisma } from "@/libs/prismaDb";
import { excludeFields } from "@/utils/exclude-fields";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { registerSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	// Rate limit: 5 registrations per IP per 60 seconds
	const rateLimited = await checkRateLimit(5, 60000);
	if (rateLimited) return rateLimited;

	const body = await request.json();
	const res = registerSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { name, email, password } = res.data;

	const isUserRegistered = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserRegistered) {
		return new NextResponse("Email already exists", { status: 409 });
	}

	const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];

	// Function to check if an email is in the list of admin emails
	function isAdminEmail(email: string) {
		return adminEmails.includes(email);
	}

	const hashedPassword = await bcrypt.hash(password, 10);

	const newUser = {
		name,
		email,
		password: hashedPassword,
		role: "USER",
	};

	if (isAdminEmail(email)) {
		newUser.role = "ADMIN";
	}

	try {
		const user = await prisma.user.create({
			data: {
				...newUser,
			},
		});

		// Fire-and-forget: evaluate alert rules for new signups
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
		return NextResponse.json({ message: msg }, { status: 500 });
	}
}, { endpoint: "/api/user/register", method: "POST" });
