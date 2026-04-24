import hashPassword from "@/libs/formatPassword";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { stripe } from "@/stripe/stripe";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type Stripe from "stripe";

export const POST = withErrorTracking(async function POST(request: Request) {
	const body = await request.text();
	const signature = (await headers()).get("Stripe-Signature") ?? "";

	let event: Stripe.Event;

	if (!process.env.STRIPE_WEBHOOK_SECRET) {
		console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting webhook");
		return new Response("Webhook secret not configured", { status: 500 });
	}

	try {
		event = stripe.webhooks.constructEvent(
			body,
			signature,
			process.env.STRIPE_WEBHOOK_SECRET
		);
	} catch (err) {
		return new Response(
			`Webhook Error: ${err instanceof Error ? err.message : "Unknown Error"}`,
			{ status: 400 }
		);
	}

	const session = event.data.object as Stripe.Checkout.Session;
	const email = session.customer_details?.email?.toLowerCase() as string;

	if (!email) {
		return new Response(null, { status: 200 });
	}

	// when first purchased
	if (event.type === "checkout.session.completed") {
		const subscription = await stripe.subscriptions.retrieve(
			session.subscription as string
		);

		// Update the price id and set the new period end.
		const exist = await prisma.user.findUnique({
			where: { email },
		});

		// Generate a random password for guest users (they must reset to log in)
		const crypto = await import("node:crypto");
		const randomPassword = crypto.randomBytes(32).toString("hex");
		const formatedPassword = await hashPassword(randomPassword);

		if (!exist) {
			await prisma.user.create({
				data: {
					name: "guest",
					email,
					password: formatedPassword,
					subscriptionId: subscription.id,
					customerId: subscription.customer as string,
					priceId: subscription.items.data[0].price.id,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
				},
			});
		} else {
			await prisma.user.update({
				where: { email },
				data: {
					subscriptionId: subscription.id,
					customerId: subscription.customer as string,
					priceId: subscription.items.data[0].price.id,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
				},
			});
		}

		// ── Vestigio Onboarding Activation ──────────────
		// If this checkout was from onboarding, activate the organization
		const metadata = session.metadata || {};
		if (metadata.onboarding === "true" && metadata.organizationId) {
			const orgId = metadata.organizationId;
			const userId = metadata.userId;
			const priceId = subscription.items.data[0].price.id;

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

			// Create initial audit cycle and dispatch the worker fire-and-forget.
			// The worker (apps/audit-runner) will run staged-pipeline + persist
			// PageInventoryItem rows. Webhook returns 200 immediately; if this
			// process dies mid-crawl, the heal cron in instrumentation.ts
			// re-dispatches orphaned `pending` cycles.
			const env = await prisma.environment.findFirst({
				where: { organizationId: orgId },
			});
			if (env) {
				const cycle = await prisma.auditCycle.create({
					data: {
						organizationId: orgId,
						environmentId: env.id,
						status: "pending",
						cycleType: "full",
					},
				});
				// Dispatch (Wave 5 Fase 1A): prefer Redis queue → worker
				// service. Falls back to in-process fire-and-forget when
				// Redis isn't configured so single-box deploys still work.
				const { enqueueAuditCycle } = await import(
					"../../../../../apps/platform/audit-cycle-queue"
				);
				const enqueued = await enqueueAuditCycle({
					cycleId: cycle.id,
					environmentId: env.id,
					organizationId: orgId,
					priority: "cold",
				});
				if (!enqueued) {
					import("../../../../../apps/audit-runner/run-cycle")
						.then((m) => m.runAuditCycle(cycle.id))
						.catch((err) => {
							console.error(`[stripe-webhook] audit dispatch failed for cycle ${cycle.id}:`, err);
						});
				}
			}
		}
	}

	// when renewed the subscription
	if (event.type === "invoice.payment_succeeded") {
		const subscription = await stripe.subscriptions.retrieve(
			session.subscription as string
		);

		await prisma.user.update({
			where: { subscriptionId: subscription.id },
			data: {
				priceId: subscription.items.data[0].price.id,
				currentPeriodEnd: new Date(subscription.current_period_end * 1000),
			},
		});
	}

	// When a payment fails (subscription expires)
	if (event.type === "customer.subscription.updated") {
		const subscription = await stripe.subscriptions.retrieve(
			session.subscription as string
		);

		await prisma.user.update({
			where: { subscriptionId: subscription.id },
			data: {
				currentPeriodEnd: subscription?.current_period_end
					? new Date(subscription.current_period_end * 1000)
					: null,
				subscriptionId: null,
				priceId: null,
			},
		});
	}

	revalidatePath("/user/billing");

	return new Response(null, { status: 200 });
}, { endpoint: "/api/stripe/webhook", method: "POST" });

