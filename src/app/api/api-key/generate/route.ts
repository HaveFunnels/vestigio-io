import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { generateAPIKeyPayloadSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const session = await getServerSession(authOptions);

	if (!session?.user?.email) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const res = generateAPIKeyPayloadSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { keyName } = res.data;

	const user = await prisma.user.findUnique({
		where: { email: session.user.email },
	});

	if (!user) {
		return NextResponse.json({ message: "User not found!" }, { status: 404 });
	}

	// Generate a cryptographically secure random API key
	const rawKey = `vst_${crypto.randomBytes(32).toString("hex")}`;

	// Hash the key for storage (only the hash is stored)
	const hashedKey = await bcrypt.hash(rawKey, 10);

	try {
		await prisma.apiKey.create({
			data: {
				name: keyName,
				key: hashedKey,
				userId: user.id,
			},
		});

		// Return the raw key ONCE — it cannot be recovered after this
		return NextResponse.json(
			{
				message: "API Key generated successfully",
				key: rawKey,
			},
			{ status: 200 }
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "Something went wrong" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/api-key/generate", method: "POST" });
