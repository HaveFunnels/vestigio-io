import { withErrorTracking } from "@/libs/error-tracker";
import { lemonSqueezyApiInstance } from "@/lemonSqueezy/ls";
import { isAuthorized } from "@/libs/isAuthorized";
import { NextResponse } from "next/server";
import { lemonSqueezyPaymentSchema } from "./schema";

export const dynamic = "force-dynamic";

export const POST = withErrorTracking(async function POST(req: Request) {
	try {
		const user = await isAuthorized();
		if (!user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const payload = await req.json();

		const res = lemonSqueezyPaymentSchema.safeParse(payload);

		if (!res.success) {
			return NextResponse.json(
				{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const response = await lemonSqueezyApiInstance.post("/checkouts", {
			data: {
				type: "checkouts",
				attributes: {
					checkout_data: {
						custom: {
							user_id: user.id,
						},
					},
				},
				relationships: {
					store: {
						data: {
							type: "stores",
							id: process.env.LEMON_SQUEEZY_STORE_ID!,
						},
					},
					variant: {
						data: {
							type: "variants",
							id: res.data.productId,
						},
					},
				},
			},
		});

		const checkoutUrl = response.data.data.attributes.url;

		// if already purchased then redirect to change plan

		return NextResponse.json({ checkoutUrl: checkoutUrl }, { status: 200 });
	} catch (error) {
		return Response.json({ message: "An error occurred" }, { status: 500 });
	}
}, { endpoint: "/api/lemon-squeezy/payment", method: "POST" });
