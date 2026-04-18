import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { isDemoEmail } from "@/lib/demo-account";
import { prisma } from "@/libs/prismaDb";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { changePasswordSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const session = await getServerSession(authOptions);

	if (!session?.user?.email) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const res = changePasswordSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { currentPassword, password } = res.data;

	// Always use the session email, not from request body
	const user = await prisma.user.findUnique({
		where: { email: session.user.email },
	});

	if (!user) {
		return NextResponse.json({ message: "User not found!" }, { status: 404 });
	}

	if (isDemoEmail(user?.email)) {
		return NextResponse.json(
			{ message: "Can't change password for demo user" },
			{ status: 401 }
		);
	}

	// check to see if passwords match
	const passwordMatch = await bcrypt.compare(
		currentPassword,
		user?.password as string
	);

	if (!passwordMatch) {
		return NextResponse.json(
			{ message: "Current password is incorrect." },
			{ status: 400 }
		);
	}

	const hashedPassword = await bcrypt.hash(password, 10);

	try {
		await prisma.user.update({
			where: { email: session.user.email },
			data: {
				password: hashedPassword,
			},
		});

		return NextResponse.json({ message: "Password Updated" }, { status: 200 });
	} catch (error) {
		return new NextResponse("Something went wrong", { status: 500 });
	}
}, { endpoint: "/api/user/change-password", method: "POST" });
