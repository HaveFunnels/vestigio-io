import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";

async function captureRawBody(req: NextRequest) {
	const rawBody = await req.text(); // Capture the raw body as text
	return rawBody;
}

const verifyPaddleSignature = (
	paddleSignature: string,
	rawBody: string
): boolean => {
	const [tsPart, h1Part] = paddleSignature.split(";");
	const ts = tsPart.split("=")[1];
	const receivedH1 = h1Part.split("=")[1];

	const signedPayload = `${ts}:${rawBody}`;
	const key = process.env.PADDLE_WEBHOOK_SECRET as string;

	const hmac = createHmac("sha256", key).update(signedPayload).digest("hex");

	return hmac === receivedH1;
};

const getCustomer = async (customerId: string) => {
	const res = await axios.get(
		`${process.env.NEXT_PUBLIC_PADDLE_API_URL}/customers/${customerId}`,
		{
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
			},
		}
	);

	const customer = res.data;

	return customer.data;
};

export const POST = withErrorTracking(async function POST(req: NextRequest) {
	try {
		const paddleSignature = req.headers.get("paddle-signature");

		if (!paddleSignature) {
			return NextResponse.json(
				{ error: "Paddle-Signature header missing" },
				{ status: 400 }
			);
		}

		const rawBody = await captureRawBody(req);

		if (!rawBody) {
			return NextResponse.json(
				{ error: "Request body is empty" },
				{ status: 400 }
			);
		}

		const isValid = verifyPaddleSignature(paddleSignature, rawBody);

		if (!isValid) {
			return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
		}

		const body = JSON.parse(rawBody);
		const { data } = body;
		// eslint-disable-next-line @typescript-eslint/naming-convention
		const { billing_period, subscription_id, customer_id, items } = data;

		if (!billing_period || !subscription_id || !customer_id || !items) {
			return NextResponse.json({ error: "Invalid data" }, { status: 400 });
		}

		const customer = await getCustomer(customer_id);

		// Process the webhook data
		// console.log(body.event_type);
		if (body.event_type === "subscription.canceled") {
			const user = await prisma.user.findUnique({
				where: {
					email: customer.email,
				},
			});

			if (!user) {
				return NextResponse.json({ error: "User not found" }, { status: 400 });
			}

			if (user) {
				await prisma.user.update({
					where: {
						email: customer.email,
					},
					data: {
						subscriptionId: null,
						customerId: null,
						priceId: null,
						currentPeriodEnd: null,
					},
				});
			}
		}

		if (body.event_type === "subscription.updated") {
			await prisma.user.update({
				where: {
					email: customer.email,
				},
				data: {
					subscriptionId: subscription_id,
					customerId: customer_id as string,
					priceId: items[0].price_id,
					currentPeriodEnd: new Date(billing_period.ends_at),
				},
			});
		}

		if (body.event_type === "transaction.completed") {
			if (!customer) {
				return NextResponse.json(
					{ error: "Customer not found" },
					{ status: 400 }
				);
			}

			const user = await prisma.user.findUnique({
				where: {
					email: customer.email,
				},
			});

			if (!user) {
				await prisma.user.create({
					data: {
						name: "guest",
						email: customer.email,
						password: "",
						subscriptionId: subscription_id,
						customerId: customer_id as string,
						priceId: items[0].price_id,
						currentPeriodEnd: new Date(billing_period.ends_at),
					},
				});
			} else {
				await prisma.user.update({
					where: {
						email: customer.email,
					},
					data: {
						subscriptionId: subscription_id,
						customerId: customer_id as string,
						priceId: items[0].price_id,
						currentPeriodEnd: new Date(billing_period.ends_at),
					},
				});
			}

			// ── Vestigio Onboarding Activation ──────────────
			// If this transaction has onboarding custom_data, activate the organization
			const customData = data.custom_data || {};
			if (customData.onboarding === "true" && customData.organizationId) {
				const orgId = customData.organizationId;
				const userId = customData.userId;
				const priceId = items[0].price_id;

				// Determine plan from price ID (reads from PlatformConfig DB)
				const { resolvePlanFromPriceId } = await import("@/libs/plan-config");
				const plan = await resolvePlanFromPriceId(priceId);

				// Activate organization
				await prisma.organization.update({
					where: { id: orgId },
					data: { plan, status: "active" },
				});

				// Create membership (owner)
				if (userId) {
					await prisma.membership.upsert({
						where: {
							userId_organizationId: { userId, organizationId: orgId },
						},
						create: {
							userId,
							organizationId: orgId,
							role: "owner",
						},
						update: { role: "owner" },
					});
				}

				// Create initial audit cycle
				const env = await prisma.environment.findFirst({
					where: { organizationId: orgId },
				});
				if (env) {
					await prisma.auditCycle.create({
						data: {
							organizationId: orgId,
							environmentId: env.id,
							status: "pending",
							cycleType: "full",
						},
					});
				}
			}
		}

		// revalidatePath("/user/billing");

		return NextResponse.json(
			{ message: "Webhook processed successfully" },
			{ status: 200 }
		);
	} catch (error) {
		console.error("Error processing webhook:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/paddle/webhook", method: "POST" });
