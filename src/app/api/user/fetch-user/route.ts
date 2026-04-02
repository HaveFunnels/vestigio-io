import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const GET = withErrorTracking(async function GET(req: NextRequest) {
	const session = await getServerSession(authOptions);

	if (!session?.user?.email) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	try {
		// Only return the authenticated user's own subscription data
		const user = await prisma.user.findUnique({
			where: { email: session.user.email },
		});

		return NextResponse.json(
			{
				priceId: user?.priceId,
				subscriptionId: user?.subscriptionId,
				currentPeriodEnd: user?.currentPeriodEnd,
			},
			{ status: 200 }
		);
	} catch (error) {
		return new NextResponse("Something went wrong", { status: 500 });
	}
}, { endpoint: "/api/user/fetch-user", method: "GET" });
