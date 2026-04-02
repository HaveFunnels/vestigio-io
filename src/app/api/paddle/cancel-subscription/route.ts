import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import axios, { AxiosError } from "axios";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { paddleCancelSubscriptionSchema } from "./schema";

const POST = withErrorTracking(async function POST(req: NextRequest) {
	const session = await getServerSession(authOptions);

	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await req.json();
	const res = paddleCancelSubscriptionSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { subscriptionId } = res.data;

	// Verify the subscription belongs to the authenticated user
	if (session.user.subscriptionId !== subscriptionId) {
		return NextResponse.json(
			{ message: "Forbidden: subscription does not belong to this user" },
			{ status: 403 }
		);
	}

	try {
		const { data } = await axios.post(
			`${process.env.NEXT_PUBLIC_PADDLE_API_URL}/subscriptions/${subscriptionId}/cancel`,
			{
				effective_from: "immediately",
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
				},
			}
		);

		return NextResponse.json(
			{ message: "Subscription canceled successfully", data },
			{ status: 200 }
		);
	} catch (error) {
		if (error instanceof AxiosError) {
			return NextResponse.json(
				{
					message: "An error occurred",
					error: error.response?.data.error.detail,
				},
				{ status: error.response?.status }
			);
		}

		return NextResponse.json(
			{ message: "Internal Server Error" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/paddle/cancel-subscription", method: "POST" });

export { POST };
