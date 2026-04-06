import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { updateUserSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const body = await request.json();
	const res = updateUserSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const session = await getServerSession(authOptions);

	if (!session?.user) {
		return NextResponse.json({ message: "User not found!" }, { status: 404 });
	}

	const isDemoUser = session?.user?.email?.includes("demo-");

	if (isDemoUser) {
		return NextResponse.json(
			{ message: "Can't update demo user" },
			{
				status: 401,
			}
		);
	}

	try {
		// Normalise phone: empty string clears it; otherwise ensure leading +
		const data: any = { ...res.data };
		if (data.phone !== undefined) {
			if (data.phone === "") {
				data.phone = null;
			} else if (!data.phone.startsWith("+")) {
				data.phone = `+${data.phone}`;
			}
		}

		const user = await prisma.user.update({
			where: {
				email: session?.user?.email as string,
			},
			data,
		});

		revalidatePath("/user");

		return NextResponse.json(
			{
				message: "User Updated Successfully!",
				data: {
					email: user.email,
					name: user.name,
					image: user.image,
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		return new NextResponse("Something went wrong", { status: 500 });
	}
}, { endpoint: "/api/user/update", method: "POST" });
