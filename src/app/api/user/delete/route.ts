import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { userDeleteSchema } from "./schema";

export const DELETE = withErrorTracking(async function DELETE(request: Request) {
	const session = await getServerSession(authOptions);

	if (!session?.user?.email) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const res = userDeleteSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { email } = res.data;

	const isDemoUser = email?.includes("demo-");

	if (isDemoUser) {
		return NextResponse.json(
			{ message: "Can't delete demo user" },
			{ status: 400 }
		);
	}

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		return NextResponse.json({ message: "User not found!" }, { status: 404 });
	}

	// Authorization: user can delete themselves, OR session user is ADMIN
	const isOwnAccount = session.user.email === user.email;
	const sessionIsAdmin = (session.user as any).role === "ADMIN";

	if (!isOwnAccount && !sessionIsAdmin) {
		return NextResponse.json(
			{ message: "Unauthorized Access" },
			{ status: 401 }
		);
	}

	try {
		await prisma.user.delete({
			where: { email },
		});

		return NextResponse.json(
			{ message: "Account Deleted Successfully!" },
			{ status: 200 }
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "Something went wrong" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/user/delete", method: "DELETE" });
