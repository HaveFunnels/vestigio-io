import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import axios from "axios";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { paddleChangePlanSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const session = await getServerSession(authOptions);

	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const res = paddleChangePlanSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { subscriptionId, priceId } = res.data;

	// Verify the subscription belongs to the authenticated user
	if (session.user.subscriptionId !== subscriptionId) {
		return NextResponse.json(
			{ message: "Forbidden: subscription does not belong to this user" },
			{ status: 403 }
		);
	}

	try {
		const { data: response } = await axios.patch(
			`${process.env.NEXT_PUBLIC_PADDLE_API_URL}/subscriptions/${subscriptionId}`,
			{
				proration_billing_mode: "prorated_immediately",
				items: [
					{
						price_id: priceId,
						quantity: 1,
					},
				],
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
				},
			}
		);

		return NextResponse.json(
			{
				subscriptionId: response.data.id,
				customerId: response.data.customer_id,
				priceId: response.data.items[0].price.id,
				currentPeriodEnd: new Date(
					response.data.current_billing_period.ends_at
				),
			},
			{ status: 200 }
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "Internal Server Error" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/paddle/change-plan", method: "POST" });
