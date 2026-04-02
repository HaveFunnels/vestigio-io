import { withErrorTracking } from "@/libs/error-tracker";
import hashPassword from "@/libs/formatPassword";
import { prisma } from "@/libs/prismaDb";
import crypto from "node:crypto";


export const POST = withErrorTracking(async function POST(req: Request) {
	try {
		// Catch the event type
		const clonedReq = req.clone();
		const eventType = req.headers.get("X-Event-Name");
		const body = await req.json();

		// Check signature
		const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SIGNATURE;
		const hmac = crypto.createHmac("sha256", secret!);
		const digest = Buffer.from(
			hmac.update(await clonedReq.text()).digest("hex"),
			"utf8"
		);
		const signature = Buffer.from(req.headers.get("X-Signature") || "", "utf8");

		if (!crypto.timingSafeEqual(digest, signature)) {
			throw new Error("Invalid signature.");
		}

		const email = body.data.attributes.user_email;

		// First purchase
		if (eventType === "subscription_created") {
			const subscription = body.data.attributes;
			const exist = await prisma.user.findUnique({
				where: {
					email,
				},
			});

			const randomPassword = crypto.randomBytes(32).toString("hex");
		const formatedPassword = await hashPassword(randomPassword);

			if (!exist) {
				await prisma.user.create({
					data: {
						name: "guest",
						email,
						password: formatedPassword,
						subscriptionId: `${subscription.first_subscription_item.subscription_id}`,
						customerId: `${subscription.customer_id}`,
						priceId: `${subscription.variant_id}`,
						currentPeriodEnd: subscription.renews_at as Date,
					},
				});
			} else {
				await prisma.user.update({
					where: {
						email,
					},
					data: {
						subscriptionId: `${subscription.first_subscription_item.subscription_id}`,
						customerId: `${subscription.customer_id}`,
						priceId: `${subscription.variant_id}`,
						currentPeriodEnd: subscription.renews_at as Date,
					},
				});
			}
		}

		// Renewed subscription
		if (eventType === "subscription_updated") {
			await prisma.user.update({
				where: {
					email,
				},
				data: {
					currentPeriodEnd: body.data.attributes.renews_at as Date,
				},
			});
		}

		// Cancelled subscription
		if (eventType === "subscription_cancelled") {
			await prisma.user.update({
				where: {
					email,
				},
				data: {
					currentPeriodEnd: null,
					subscriptionId: null,
					customerId: null,
					priceId: null,
				},
			});
		}

		return Response.json({ message: "Webhook received" });
	} catch (err) {
		console.error(err);
		return Response.json({ message: "Server error" }, { status: 500 });
	}
}, { endpoint: "/api/lemon-squeezy/webhook", method: "POST" });
