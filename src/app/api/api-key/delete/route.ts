import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { deleteAPIKeyPayloadSchema } from "./schema";

export const DELETE = withErrorTracking(async function DELETE(request: Request) {
	const session = await getServerSession(authOptions);
	const user = session?.user;

	if (!user) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const body = await request.json();
	const res = deleteAPIKeyPayloadSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	// Verify the API key belongs to the authenticated user
	const apiKey = await prisma.apiKey.findUnique({
		where: { id: res.data.id },
	});

	if (!apiKey || apiKey.userId !== (user as any).id) {
		return NextResponse.json(
			{ message: "API key not found" },
			{ status: 404 }
		);
	}

	try {
		await prisma.apiKey.delete({
			where: { id: res.data.id },
		});

		return NextResponse.json(
			{ message: "API Key Deleted Successfully!" },
			{ status: 200 }
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "Something went wrong" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/api-key/delete", method: "DELETE" });
