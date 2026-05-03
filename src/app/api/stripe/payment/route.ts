import { isAuthorized } from "@/libs/isAuthorized";
import { withErrorTracking } from "@/libs/error-tracker";
import { absoluteUrl } from "@/libs/uitls";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { paymentSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const { requireEnv } = await import("@/libs/requireEnv");
	const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
		apiVersion: "2023-10-16",
	});

	const payload = await request.json();
	const res = paymentSchema.safeParse(payload);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const user = await isAuthorized();

	let billingUrl;
	let successUrl;

	if (user) {
		successUrl = absoluteUrl("/app/settings");
		billingUrl = absoluteUrl("/app/billing");
	} else {
		successUrl = absoluteUrl("/thank-you");
		billingUrl = absoluteUrl("/");
	}

	const { priceId, userId, isSubscribed, stripeCustomerId } = res.data;

	if (isSubscribed && stripeCustomerId) {
		const stripeSession = await stripe.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: billingUrl,
		});

		return NextResponse.json({ url: stripeSession.url }, { status: 200 });
	}

	const session = await stripe.checkout.sessions.create({
		line_items: [
			{
				price: priceId,
				quantity: 1,
			},
		],
		mode: "subscription",
		success_url: successUrl,
		cancel_url: billingUrl,
		metadata: {
			userId,
		},
	});

	return NextResponse.json({ url: session.url });
}, { endpoint: "/api/stripe/payment", method: "POST" });
