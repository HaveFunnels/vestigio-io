import { withErrorTracking } from "@/libs/error-tracker";
import hashPassword from "@/libs/formatPassword";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { inviteSigninSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const body = await request.json();
	const res = inviteSigninSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { token, password } = res.data;

	const invitation = await prisma.invitation.findUnique({
		where: { token },
		include: { user: true },
	});

	if (!invitation) {
		return NextResponse.json(
			{ message: "Invalid invitation token" },
			{ status: 400 }
		);
	}

	if (invitation.expiresAt < new Date()) {
		return NextResponse.json(
			{ message: "Invitation token expired" },
			{ status: 410 }
		);
	}

	if (invitation.accepted || invitation.user) {
		return NextResponse.json(
			{ message: "Invitation already accepted" },
			{ status: 409 }
		);
	}

	const hashedPassword = await hashPassword(password);

	try {
		await prisma.$transaction(async (tx) => {
			const user = await tx.user.create({
				data: {
					name: "Guest",
					email: invitation.email,
					password: hashedPassword,
					role: invitation.role,
				},
			});

			await tx.invitation.update({
				where: { id: invitation.id },
				data: { accepted: true, userId: user.id },
			});
		});

		return NextResponse.json({ message: "Account created" }, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{ message: "Something went wrong" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/user/invite/signin", method: "POST" });
