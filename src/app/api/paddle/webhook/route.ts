import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

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
	if (!key) return false; // Reject if no secret — never skip verification

	try {
		const [tsPart, h1Part] = paddleSignature.split(";");
		const ts = tsPart.split("=")[1];
		const receivedH1 = h1Part.split("=")[1];
		const signedPayload = `${ts}:${rawBody}`;
		const hmac = createHmac("sha256", key).update(signedPayload).digest("hex");
		// SEC-06 fix: timing-safe comparison prevents timing oracle attacks
		if (hmac.length !== receivedH1.length) return false;
		return timingSafeEqual(Buffer.from(hmac), Buffer.from(receivedH1));
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
		return "free";
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

// Idempotency tracker — in-memory dedup for webhook event IDs.
// Prevents replay attacks and double-processing from Paddle retries.
// Entries auto-pruned after 1h. For multi-instance deploys, move to Redis.
const processedWebhookIds = new Map<string, number>();

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

		// Verify webhook signature — REQUIRED in production.
		// Reject unsigned webhooks to prevent forgery attacks.
		if (!process.env.PADDLE_WEBHOOK_SECRET) {
			console.error("[Paddle Webhook] PADDLE_WEBHOOK_SECRET not configured — rejecting webhook");
			return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
		}
		if (!paddleSignature) {
			console.error("[Paddle Webhook] Missing paddle-signature header");
			return NextResponse.json({ error: "Missing signature" }, { status: 400 });
		}
		const isValid = verifyPaddleSignature(paddleSignature, rawBody);
		if (!isValid) {
			console.error("[Paddle Webhook] Invalid signature");
			return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
		}

		const body = JSON.parse(rawBody);
		const eventType = body.event_type as string;
		const eventId = body.event_id || body.notification_id || "";
		const data = body.data;

		// Idempotency: reject replayed webhooks
		if (eventId && processedWebhookIds.has(eventId)) {
			return NextResponse.json({ message: "Already processed" }, { status: 200 });
		}
		if (eventId) {
			processedWebhookIds.set(eventId, Date.now());
			// Prune old entries (keep last 1h)
			if (processedWebhookIds.size > 1000) {
				const cutoff = Date.now() - 3600_000;
				for (const [k, v] of processedWebhookIds) {
					if (v < cutoff) processedWebhookIds.delete(k);
				}
			}
		}

		logEvent(eventType, JSON.stringify(data).slice(0, 200));

		// ──────────────────────────────────────────────
		// SUBSCRIPTION EVENTS
		// ──────────────────────────────────────────────

		if (eventType === "subscription.created") {
			// New subscription — link to user and activate org
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

			// BUG-08 fix: Do NOT call handleOnboardingActivation here.
			// Paddle fires both subscription.created AND transaction.completed
			// for the same checkout. Activation is handled exclusively in
			// transaction.completed to prevent double audit cycle creation.
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
					const previousPlan = org.plan;
					await prisma.organization.update({
						where: { id: org.id },
						data: { plan },
					});
					logEvent(eventType, `Org ${org.id} plan changed to ${plan}`);

					// Trigger a new audit cycle on upgrade so the customer
					// immediately benefits from expanded coverage (e.g.
					// Playwright mode on Max, additional packs on Pro).
					const PLAN_TIER: Record<string, number> = { vestigio: 1, pro: 2, max: 3 };
					const isUpgrade = (PLAN_TIER[plan] ?? 0) > (PLAN_TIER[previousPlan] ?? 0);
					if (isUpgrade) {
						const env = await prisma.environment.findFirst({
							where: { organizationId: org.id, isProduction: true },
							select: { id: true },
						});
						if (env) {
							const cycle = await prisma.auditCycle.create({
								data: {
									organizationId: org.id,
									environmentId: env.id,
									status: "pending",
									cycleType: "full",
								},
							});
							logEvent(eventType, `Triggered upgrade audit cycle ${cycle.id} for org ${org.id}`);
							const { enqueueAuditCycle } = await import(
								"../../../../../apps/platform/audit-cycle-queue"
							);
							const enqueued = await enqueueAuditCycle({
								cycleId: cycle.id,
								environmentId: env.id,
								organizationId: org.id,
								priority: "cold",
							});
							if (!enqueued) {
								const { inProcessFallbackAllowed } = await import(
									"@/libs/audit-dispatch"
								);
								if (inProcessFallbackAllowed()) {
									import("../../../../../apps/audit-runner/run-cycle")
										.then((m) => m.runAuditCycle(cycle.id))
										.catch((err) => {
											console.error(`[paddle/webhook] upgrade audit dispatch failed for cycle ${cycle.id}:`, err);
										});
								} else {
									console.error(
										`[paddle/webhook] upgrade audit worker dispatch failed and in-process fallback disabled in production. cycle=${cycle.id}`,
									);
								}
							}
						}
					}
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
						data: { plan: "free", status: "active" },
					});
					logEvent(eventType, `Org ${org.id} downgraded to free (canceled)`);
				}

				// Telemetry — Strategist's "without sinal, agimos por anedota".
				// Records that THIS customer cancelled, so future cancel-flow
				// design can sample real reasons + replay. Best-effort write.
				try {
					const { recordProductEvent } = await import("@/libs/product-telemetry");
					await recordProductEvent({
						userId: user.id,
						orgId: org?.id,
						event: "subscription.cancel.initiated",
						properties: { provider: "paddle", subscriptionId: data?.id ?? null },
						pathname: "/webhook/paddle",
						sessionId: "server-webhook",
					});
				} catch (err) {
					console.warn("[paddle webhook] cancel telemetry failed:", err);
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
				const plan = priceId ? await resolvePlan(priceId) : "free";
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
			const { id: transactionId, subscription_id, customer_id, items, billing_period, custom_data } = data;
			if (!customer_id) {
				logEvent(eventType, "No customer_id — skipping");
				return NextResponse.json({ message: "OK" }, { status: 200 });
			}

			const customer = await getCustomer(customer_id);
			const priceId = items?.[0]?.price?.id || items?.[0]?.price_id;

			// ── Credit pack purchase? ──
			// If the priceId matches a known credit pack, this transaction
			// is a top-up rather than a subscription event. Credit the org
			// and short-circuit — packs don't touch User.subscriptionId or
			// Organization.plan.
			const { findPackByPriceId } = await import("@/libs/credit-packs");
			const pack = priceId ? await findPackByPriceId(priceId) : null;
			if (pack) {
				const orgId = custom_data?.organizationId;
				if (!orgId) {
					logEvent(
						eventType,
						`credit-pack purchase but no organizationId in custom_data (txn=${transactionId}) — logged, not credited`,
					);
				} else {
					const { addPurchasedCredits } = await import(
						"../../../../../apps/platform/credits"
					);
					const result = await addPurchasedCredits(orgId, pack.credits, {
						packKey: pack.key,
						paddleTransactionId: transactionId,
						note: `Paddle ${transactionId} · ${pack.label}`,
					});
					logEvent(
						eventType,
						result.alreadyProcessed
							? `credit-pack ${pack.key} txn=${transactionId} already credited (webhook retry)`
							: `credit-pack ${pack.key} · +${pack.credits} credits → org ${orgId}`,
					);
				}
				return NextResponse.json({ message: "OK" }, { status: 200 });
			}

			// Create or update user.
			//
			// DO NOT pre-create when custom_data.leadId is present. The
			// /lp funnel owns User creation inside promoteLeadToOrg() so
			// it can mint the activation token + send the activation
			// email. If we pre-create here, promoteLeadToOrg() sees an
			// "existing user" and skips activation entirely — buyer
			// never receives their "ative sua conta" email.
			let user = await findUser(customer_id, customer?.email);
			if (!user && customer?.email && !custom_data?.leadId) {
				// Resolve locale from Paddle's customer locale field (e.g. "pt-BR",
				// "en") or default to "pt-BR" (primary market). Paddle's customer
				// object includes the locale detected from the checkout session.
				const SUPPORTED_LOCALES = ["en", "pt-BR", "es", "de"];
				const paddleLocale = customer?.locale || "";
				const resolvedLocale = SUPPORTED_LOCALES.includes(paddleLocale)
					? paddleLocale
					: paddleLocale.startsWith("pt") ? "pt-BR"
					: paddleLocale.startsWith("es") ? "es"
					: paddleLocale.startsWith("de") ? "de"
					: "pt-BR";
				user = await prisma.user.create({
					data: {
						name: customer.name || "guest",
						email: customer.email,
						password: "",
						locale: resolvedLocale,
						subscriptionId: subscription_id || null,
						customerId: customer_id,
						priceId: priceId || null,
						currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
					},
				});
				logEvent(eventType, `Created user ${customer.email} locale=${resolvedLocale}`);
			} else if (user && subscription_id) {
				await updateUserSubscription(user.id, {
					subscriptionId: subscription_id,
					customerId: customer_id,
					priceId,
					currentPeriodEnd: billing_period?.ends_at ? new Date(billing_period.ends_at) : null,
				});
			}

			// Handle onboarding activation
			// Two funnels: legacy /onboard (organizationId) + /lp lead (leadId)
			if (
				(custom_data?.onboarding === "true" && custom_data?.organizationId) ||
				custom_data?.leadId
			) {
				await handleOnboardingActivation(custom_data, priceId, customer_id);
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
//
// Two distinct funnels feed into this helper:
//   (a) Standard signup funnel — visitor signs up → /onboard form
//       creates Org+Env+BusinessProfile BEFORE the checkout → Paddle
//       checkout opens with custom_data { organizationId, userId,
//       onboarding: 'true' }. We just activate the existing rows.
//   (b) /lp anonymous funnel — visitor fills 4-step form on /audit
//       → mini-audit → result page → Paddle checkout opens with
//       custom_data { leadId, lpFunnel: 'true' }. NO Org/Env exist
//       yet. We have to create them from the AnonymousLead row.
//
// The fork is decided here based on which key is present in custom_data.
// ──────────────────────────────────────────────

async function handleOnboardingActivation(
	customData: Record<string, string>,
	priceId: string,
	stripeCustomerId?: string | null
) {
	const plan = await resolvePlan(priceId);

	// ── Funnel B: /lp lead conversion ──
	if (customData.leadId) {
		try {
			const { promoteLeadToOrg } = await import("../../../../../apps/audit-runner/promote-lead");
			const result = await promoteLeadToOrg({
				leadId: customData.leadId,
				plan,
				stripeCustomerId,
			});
			if (result) {
				logEvent(
					"lp-conversion",
					`Lead ${customData.leadId} → user ${result.userId} / org ${result.organizationId} (newUser=${result.wasNewUser})`,
				);
			} else {
				logEvent("lp-conversion", `Lead ${customData.leadId} promotion returned null`);
			}
		} catch (err) {
			console.error(
				`[paddle-webhook] lead promotion failed for ${customData.leadId}:`,
				err,
			);
			// Gap 1 fix: Re-throw so the outer catch returns 500 and Paddle retries.
			// Silent swallowing here means a paid customer permanently loses their account.
			throw err;
		}
		return;
	}

	// ── Funnel A: standard signup activation ──
	const orgId = customData.organizationId;
	const userId = customData.userId;

	if (!orgId) {
		logEvent("onboarding", "no organizationId in custom_data — skipping");
		return;
	}

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
		const cycle = await prisma.auditCycle.create({
			data: {
				organizationId: orgId,
				environmentId: env.id,
				status: "pending",
				cycleType: "full",
			},
		});
		// Dispatch (Wave 5 Fase 1A): Redis queue → worker service.
		// Falls back to in-process when Redis not configured.
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
			const { inProcessFallbackAllowed } = await import(
				"@/libs/audit-dispatch"
			);
			if (inProcessFallbackAllowed()) {
				import("../../../../../apps/audit-runner/run-cycle")
					.then((m) => m.runAuditCycle(cycle.id))
					.catch((err) => {
						console.error(`[paddle-webhook] audit dispatch failed for cycle ${cycle.id}:`, err);
					});
			} else {
				console.error(
					`[paddle-webhook] worker dispatch failed and in-process fallback disabled in production. cycle=${cycle.id}`,
				);
			}
		}
	}

	logEvent("onboarding", `Org ${orgId} activated with plan ${plan}`);
}
