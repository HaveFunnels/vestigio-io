import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";

// ──────────────────────────────────────────────
// Paddle Webhook Handler
//
// Handles all Paddle Billing v2 events.
// Signature verification is active when PADDLE_WEBHOOK_SECRET is set.
// ──────────────────────────────────────────────

async function captureRawBody(req: NextRequest) {
	return await req.text();
}

const verifyPaddleSignature = (
	paddleSignature: string,
	rawBody: string
): boolean => {
	const key = process.env.PADDLE_WEBHOOK_SECRET;
	if (!key) return true; // Skip verification if no secret configured

	try {
		const [tsPart, h1Part] = paddleSignature.split(";");
		const ts = tsPart.split("=")[1];
		const receivedH1 = h1Part.split("=")[1];
		const signedPayload = `${ts}:${rawBody}`;
		const hmac = createHmac("sha256", key).update(signedPayload).digest("hex");
		return hmac === receivedH1;
	} catch {
		return false;
	}
};

const getCustomer = async (customerId: string) => {
	const res = await axios.get(
		`${process.env.NEXT_PUBLIC_PADDLE_API_URL || "https://api.paddle.com"}/customers/${customerId}`,
		{
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
			},
		}
	);
	return res.data.data;
};

// Helper: find user by Paddle customer ID or email
async function findUser(customerId: string, email?: string) {
	// Try by customerId first (most reliable)
	let user = await prisma.user.findFirst({ where: { customerId } });
	if (user) return user;
	// Fallback to email
	if (email) {
		user = await prisma.user.findUnique({ where: { email } });
	}
	return user;
}

// Helper: resolve plan from price ID
async function resolvePlan(priceId: string): Promise<string> {
	try {
		const { resolvePlanFromPriceId } = await import("@/libs/plan-config");
		return await resolvePlanFromPriceId(priceId);
	} catch {
		return "vestigio";
	}
}

// Helper: update user subscription fields
async function updateUserSubscription(
	userId: string,
	data: {
		subscriptionId?: string | null;
		customerId?: string | null;
		priceId?: string | null;
		currentPeriodEnd?: Date | null;
	}
) {
	await prisma.user.update({ where: { id: userId }, data });
}

// Helper: find org by user membership
async function findUserOrg(userId: string) {
	const membership = await prisma.membership.findFirst({
		where: { userId },
		include: { organization: true },
	});
	return membership?.organization || null;
}

// Helper: log webhook event for debugging
function logEvent(eventType: string, detail: string) {
	console.log(`[Paddle Webhook] ${eventType}: ${detail}`);
}

export const POST = withErrorTracking(async function POST(req: NextRequest) {
	try {
		const paddleSignature = req.headers.get("paddle-signature");

		const rawBody = await captureRawBody(req);
		if (!rawBody) {
			return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
		}

		// Verify signature if secret is configured
		if (paddleSignature) {
			const isValid = verifyPaddleSignature(paddleSignature, rawBody);
			if (!isValid) {
				console.error("[Paddle Webhook] Invalid signature");
				return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
			}
		}

		const body = JSON.parse(rawBody);
		const eventType = body.event_type as string;
		const data = body.data;

		logEvent(eventType, JSON.stringify(data).slice(0, 200));

		// ──────────────────────────────────────────────
		// SUBSCRIPTION EVENTS
		// ──────────────────────────────────────────────

		if (eventType === "subscription.created") {
			// New subscription — link to user and activate org
			const { subscription_id, customer_id, items, billing_period, custom_data } = data;
			const customer = await getCustomer(customer_id);
			const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;

			const user = await findUser(customer_id, customer?.email);
			if (user) {
				await updateUserSubscription(user.id, {
					subscriptionId: subscription_id,
					customerId: customer_id,
					priceId,
					currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
				});

				// Resolve plan and update org
				const plan = await resolvePlan(priceId);
				const org = await findUserOrg(user.id);
				if (org) {
					await prisma.organization.update({
						where: { id: org.id },
						data: { plan, status: "active" },
					});
				}

				logEvent(eventType, `User ${user.email} subscribed to ${plan}`);
			}

			// Handle onboarding activation (same as transaction.completed)
			if (custom_data?.onboarding === "true" && custom_data?.organizationId) {
				await handleOnboardingActivation(custom_data, priceId);
			}
		}

		if (eventType === "subscription.updated") {
			// Plan change, billing period update, etc.
			const { subscription_id, customer_id, items, billing_period } = data;
			const customer = await getCustomer(customer_id);
			const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;

			const user = await findUser(customer_id, customer?.email);
			if (user) {
				await updateUserSubscription(user.id, {
					subscriptionId: subscription_id,
					customerId: customer_id,
					priceId,
					currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
				});

				// Update org plan if price changed
				const plan = await resolvePlan(priceId);
				const org = await findUserOrg(user.id);
				if (org && org.plan !== plan) {
					await prisma.organization.update({
						where: { id: org.id },
						data: { plan },
					});
					logEvent(eventType, `Org ${org.id} plan changed to ${plan}`);
				}
			}
		}

		if (eventType === "subscription.canceled") {
			const { customer_id } = data;
			const customer = await getCustomer(customer_id);
			const user = await findUser(customer_id, customer?.email);

			if (user) {
				await updateUserSubscription(user.id, {
					subscriptionId: null,
					customerId: customer_id, // Keep customerId for reactivation
					priceId: null,
					currentPeriodEnd: null,
				});

				// Downgrade org to free plan
				const org = await findUserOrg(user.id);
				if (org) {
					await prisma.organization.update({
						where: { id: org.id },
						data: { plan: "vestigio", status: "active" },
					});
					logEvent(eventType, `Org ${org.id} downgraded to free (canceled)`);
				}
			}
		}

		if (eventType === "subscription.paused") {
			const { customer_id } = data;
			const customer = await getCustomer(customer_id);
			const user = await findUser(customer_id, customer?.email);

			if (user) {
				const org = await findUserOrg(user.id);
				if (org) {
					await prisma.organization.update({
						where: { id: org.id },
						data: { status: "suspended" },
					});
					logEvent(eventType, `Org ${org.id} suspended (paused)`);
				}
			}
		}

		if (eventType === "subscription.resumed") {
			const { customer_id, items } = data;
			const customer = await getCustomer(customer_id);
			const user = await findUser(customer_id, customer?.email);

			if (user) {
				const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;
				const plan = priceId ? await resolvePlan(priceId) : "vestigio";
				const org = await findUserOrg(user.id);
				if (org) {
					await prisma.organization.update({
						where: { id: org.id },
						data: { plan, status: "active" },
					});
					logEvent(eventType, `Org ${org.id} reactivated (${plan})`);
				}
			}
		}

		if (eventType === "subscription.past_due") {
			// Payment failed — subscription still active but at risk
			const { customer_id } = data;
			const customer = await getCustomer(customer_id);
			const user = await findUser(customer_id, customer?.email);

			if (user) {
				logEvent(eventType, `User ${user.email} has past-due subscription`);
				// Don't suspend yet — Paddle retries. Just log for now.
				// Could add a warning banner in the app UI later.
			}
		}

		if (eventType === "subscription.activated") {
			// Trial ended, subscription is now active
			const { subscription_id, customer_id, items, billing_period } = data;
			const customer = await getCustomer(customer_id);
			const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;

			const user = await findUser(customer_id, customer?.email);
			if (user) {
				await updateUserSubscription(user.id, {
					subscriptionId: subscription_id,
					customerId: customer_id,
					priceId,
					currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
				});
				logEvent(eventType, `User ${user.email} subscription activated`);
			}
		}

		if (eventType === "subscription.trialing") {
			const { subscription_id, customer_id, items } = data;
			const customer = await getCustomer(customer_id);
			const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;

			const user = await findUser(customer_id, customer?.email);
			if (user) {
				await updateUserSubscription(user.id, {
					subscriptionId: subscription_id,
					customerId: customer_id,
					priceId,
				});
				logEvent(eventType, `User ${user.email} started trial`);
			}
		}

		// ──────────────────────────────────────────────
		// TRANSACTION EVENTS
		// ──────────────────────────────────────────────

		if (eventType === "transaction.completed") {
			const { subscription_id, customer_id, items, billing_period, custom_data } = data;
			if (!customer_id) {
				logEvent(eventType, "No customer_id — skipping");
				return NextResponse.json({ message: "OK" }, { status: 200 });
			}

			const customer = await getCustomer(customer_id);
			const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;

			// Create or update user
			let user = await findUser(customer_id, customer?.email);
			if (!user && customer?.email) {
				user = await prisma.user.create({
					data: {
						name: customer.name || "guest",
						email: customer.email,
						password: "",
						subscriptionId: subscription_id || null,
						customerId: customer_id,
						priceId: priceId || null,
						currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
					},
				});
				logEvent(eventType, `Created user ${customer.email}`);
			} else if (user && subscription_id) {
				await updateUserSubscription(user.id, {
					subscriptionId: subscription_id,
					customerId: customer_id,
					priceId,
					currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
				});
			}

			// Handle onboarding activation
			if (custom_data?.onboarding === "true" && custom_data?.organizationId) {
				await handleOnboardingActivation(custom_data, priceId);
			}
		}

		if (eventType === "transaction.payment_failed") {
			const { customer_id } = data;
			logEvent(eventType, `Payment failed for customer ${customer_id}`);
			// Paddle handles retries automatically. Log for monitoring.
		}

		if (eventType === "transaction.updated") {
			logEvent(eventType, `Transaction updated for ${data.id}`);
		}

		// ──────────────────────────────────────────────
		// CUSTOMER EVENTS
		// ──────────────────────────────────────────────

		if (eventType === "customer.created") {
			logEvent(eventType, `New customer: ${data.email}`);
		}

		if (eventType === "customer.updated") {
			// If email changed in Paddle, update our user record
			const { id: customerId, email: newEmail } = data;
			if (customerId && newEmail) {
				const user = await prisma.user.findFirst({ where: { customerId } });
				if (user && user.email !== newEmail) {
					logEvent(eventType, `Customer email changed: ${user.email} → ${newEmail}`);
					// Don't auto-update email — could break auth. Just log.
				}
			}
		}

		// ──────────────────────────────────────────────
		// ADJUSTMENT / REFUND EVENTS
		// ──────────────────────────────────────────────

		if (eventType === "adjustment.created" || eventType === "adjustment.updated") {
			const { action, reason } = data;
			logEvent(eventType, `${action} — reason: ${reason}`);
			// Could trigger notification to admin or update a refund tracker
		}

		// ──────────────────────────────────────────────
		// UNHANDLED EVENTS — log for visibility
		// ──────────────────────────────────────────────

		const handledEvents = [
			"subscription.created", "subscription.updated", "subscription.canceled",
			"subscription.paused", "subscription.resumed", "subscription.past_due",
			"subscription.activated", "subscription.trialing",
			"transaction.completed", "transaction.payment_failed", "transaction.updated",
			"customer.created", "customer.updated",
			"adjustment.created", "adjustment.updated",
		];
		if (!handledEvents.includes(eventType)) {
			logEvent(eventType, `Unhandled event type (logged, not processed)`);
		}

		return NextResponse.json({ message: "Webhook processed successfully" }, { status: 200 });
	} catch (error) {
		console.error("[Paddle Webhook] Error processing webhook:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}, { endpoint: "/api/paddle/webhook", method: "POST" });

// ──────────────────────────────────────────────
// Onboarding Activation Helper
// ──────────────────────────────────────────────

async function handleOnboardingActivation(
	customData: Record<string, string>,
	priceId: string
) {
	const orgId = customData.organizationId;
	const userId = customData.userId;
	const plan = await resolvePlan(priceId);

	await prisma.organization.update({
		where: { id: orgId },
		data: { plan, status: "active" },
	});

	if (userId) {
		await prisma.membership.upsert({
			where: {
				userId_organizationId: { userId, organizationId: orgId },
			},
			create: { userId, organizationId: orgId, role: "owner" },
			update: { role: "owner" },
		});
	}

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

	logEvent("onboarding", `Org ${orgId} activated with plan ${plan}`);
}
