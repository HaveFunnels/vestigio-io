import { NextRequest, NextResponse } from "next/server";

import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	cancelPreapproval,
	getChargeback,
	getPayment,
	getPreapproval,
	parseExternalRef,
	verifyMpWebhookSignature,
	type MpPaymentResponse,
} from "@/libs/mp-api";
import { resolvePlanFromPriceId } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// Mercado Pago Webhook Handler
//
// MP fires this endpoint whenever a `payment`, `preapproval`, or
// `authorized_payment` (i.e. one auto-recurring charge) changes
// state. The payload only carries `data.id` — we fetch the full
// object from MP using that id, then update our state.
//
// Security:
//   - HMAC SHA256 signature verify against MP_WEBHOOK_SECRET
//   - In-memory event id dedupe (replay guard, copies paddle pattern)
//   - We treat MP's API as the source of truth: never accept any state
//     field directly from the webhook body, always re-fetch.
//
// Routing of external references (set when we create the payment):
//   pixrenew:<orgId>:<userId>:<isoDate>:<nonce> → PixCharge reconcile
//   creditpack:<orgId>:<packKey>:<nonce>        → addPurchasedCredits
//   preapproval:<userId>:<planKey>:<nonce>      → preapproval bootstrap
// ──────────────────────────────────────────────

// Idempotency cache. Single-process; for multi-instance deploys move
// to Redis (same caveat as paddle webhook).
const processedEventIds = new Map<string, number>();

function dedupe(eventKey: string): boolean {
	if (!eventKey) return false;
	if (processedEventIds.has(eventKey)) return true;
	processedEventIds.set(eventKey, Date.now());
	if (processedEventIds.size > 2000) {
		const cutoff = Date.now() - 3600_000;
		for (const [k, v] of processedEventIds) {
			if (v < cutoff) processedEventIds.delete(k);
		}
	}
	return false;
}

function log(event: string, detail: string) {
	console.log(`[MP Webhook] ${event}: ${detail}`);
}

// ──────────────────────────────────────────────
// User / Org lookup helpers
// ──────────────────────────────────────────────

async function findUserByPayer(payerId?: number, email?: string) {
	if (payerId) {
		const byCustomer = await prisma.user.findFirst({
			where: { customerId: String(payerId) },
		});
		if (byCustomer) return byCustomer;
	}
	if (email) {
		return prisma.user.findFirst({
			where: { OR: [{ email }, { billingEmail: email }] },
		});
	}
	return null;
}

async function findUserOrg(userId: string) {
	const membership = await prisma.membership.findFirst({
		where: { userId },
		include: { organization: true },
	});
	return membership?.organization || null;
}

// ──────────────────────────────────────────────
// Subscription event handler — preapproval / authorized_payment
// ──────────────────────────────────────────────

async function handlePreapprovalEvent(preapprovalId: string) {
	const sub = await getPreapproval(preapprovalId);
	const planKey = sub.preapproval_plan_id
		? await resolvePlanFromPriceId(sub.preapproval_plan_id)
		: "vestigio";

	// Locate the user: external_reference is canonical when we set it
	// at create-time (preapproval:<userId>:...). Fall back to email +
	// payer id lookup when MP delivers a webhook for a subscription we
	// didn't create directly (rare, but possible via dashboard ops).
	let userId: string | null = null;
	if (sub.external_reference) {
		const parsed = parseExternalRef(sub.external_reference);
		if (parsed.tag === "preapproval" && parsed.parts[0]) {
			userId = parsed.parts[0];
		}
	}
	let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
	if (!user) {
		user = await findUserByPayer(sub.payer_id, sub.payer_email);
	}
	if (!user) {
		log("preapproval", `no user matched for preapproval=${preapprovalId} email=${sub.payer_email}`);
		return;
	}

	// Persist subscription state. We use `subscriptionId` to hold the
	// MP preapproval id (single semantic slot across providers) and
	// also write `mpPreapprovalId` for unambiguous MP-side queries.
	await prisma.user.update({
		where: { id: user.id },
		data: {
			paymentProvider: "mercadopago",
			subscriptionId: sub.status === "cancelled" ? null : sub.id,
			mpPreapprovalId: sub.status === "cancelled" ? null : sub.id,
			customerId: sub.payer_id ? String(sub.payer_id) : user.customerId,
			priceId: sub.preapproval_plan_id ?? null,
			currentPeriodEnd: sub.next_payment_date ? new Date(sub.next_payment_date) : null,
		},
	});

	const org = await findUserOrg(user.id);
	if (!org) {
		log("preapproval", `user ${user.id} has no org — subscription state saved but not propagated`);
		return;
	}

	if (sub.status === "authorized") {
		await prisma.organization.update({
			where: { id: org.id },
			data: { plan: planKey, status: "active" },
		});
		log("preapproval.authorized", `org=${org.id} plan=${planKey}`);
	} else if (sub.status === "paused") {
		await prisma.organization.update({
			where: { id: org.id },
			data: { status: "suspended" },
		});
		log("preapproval.paused", `org=${org.id}`);
	} else if (sub.status === "cancelled") {
		await prisma.organization.update({
			where: { id: org.id },
			data: { plan: "vestigio", status: "active" },
		});
		log("preapproval.cancelled", `org=${org.id} downgraded`);
	} else {
		log("preapproval.pending", `org=${org.id} sub=${sub.id} status=${sub.status}`);
	}
}

// ──────────────────────────────────────────────
// Payment event handler — payment.created / payment.updated
//
// Routes by external_reference tag:
//   pixrenew  → PixCharge update + extend User.currentPeriodEnd on approval
//   creditpack → mint OrgCredits.purchasedBalance (idempotent via txnId)
//   <else>    → log only (manual charges from dashboard, etc.)
// ──────────────────────────────────────────────

async function handlePaymentEvent(paymentId: string) {
	const payment = await getPayment(paymentId);
	const ref = payment.external_reference || "";
	const parsed = parseExternalRef(ref);

	if (parsed.tag === "pixrenew") {
		await reconcilePixCharge(payment);
		return;
	}
	if (parsed.tag === "creditpack") {
		await reconcileCreditPack(payment, parsed.parts);
		return;
	}
	log("payment.unmatched", `id=${payment.id} status=${payment.status} ref=${ref || "(empty)"}`);
}

async function reconcilePixCharge(payment: MpPaymentResponse) {
	const ref = payment.external_reference;
	if (!ref) return;

	const charge = await prisma.pixCharge.findUnique({
		where: { externalReference: ref },
	});
	if (!charge) {
		log("pixrenew.no-charge", `payment ${payment.id} ref=${ref} — race or stale, will reconcile on next event`);
		return;
	}

	// Map MP status to our internal status. Pending → still waiting on
	// PIX clearing; approved → mark paid + extend currentPeriodEnd;
	// rejected/cancelled/expired → mark dead, dunning cron will issue
	// a fresh PIX if the cycle is still active.
	const nextStatus =
		payment.status === "approved"   ? "approved"
		: payment.status === "rejected" ? "rejected"
		: payment.status === "cancelled" ? "cancelled"
		: payment.status === "refunded" ? "rejected"
		: "pending";

	await prisma.pixCharge.update({
		where: { id: charge.id },
		data: {
			mpPaymentId: String(payment.id),
			status: nextStatus,
			paidAt: payment.status === "approved" && payment.date_approved
				? new Date(payment.date_approved)
				: nextStatus === "approved"
					? new Date()
					: charge.paidAt,
		},
	});

	if (nextStatus === "approved") {
		// Extend the user's currentPeriodEnd by one cycle. We compute
		// "one month" as adding 30 days from the previous due date or
		// from now (whichever is later) so back-to-back renewals don't
		// drift if the buyer paid early.
		const user = await prisma.user.findUnique({ where: { id: charge.userId } });
		if (user) {
			const base = user.currentPeriodEnd && user.currentPeriodEnd > new Date()
				? user.currentPeriodEnd
				: new Date();
			const nextPeriodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
			await prisma.user.update({
				where: { id: user.id },
				data: {
					paymentProvider: "mercadopago",
					currentPeriodEnd: nextPeriodEnd,
				},
			});
		}

		await prisma.organization.update({
			where: { id: charge.organizationId },
			data: { status: "active" },
		});
		log("pixrenew.approved", `charge=${charge.id} org=${charge.organizationId}`);
	} else {
		log("pixrenew.update", `charge=${charge.id} → ${nextStatus}`);
	}
}

// ──────────────────────────────────────────────
// Chargeback handler — buyer disputed the charge with their card
// issuer. We suspend the org immediately so we stop serving, cancel
// the preapproval so MP stops billing, and log loudly so a human can
// follow up (chargebacks usually deserve a manual review).
//
// We act on `pending` and `in_process` (active disputes) and `lost`
// (MP refunded the money). `won` means MP defended the charge on
// our behalf — no action needed, the money stays.
// ──────────────────────────────────────────────

async function handleChargebackEvent(chargebackId: string) {
	const cb = await getChargeback(chargebackId);
	log("chargeback.recv", `id=${cb.id} payment=${cb.payment_id} status=${cb.status} reason=${cb.reason ?? "?"}`);

	if (cb.status === "won") return; // we kept the money; nothing to revert

	const payment = await getPayment(cb.payment_id);
	const ref = payment.external_reference || "";
	const parsed = parseExternalRef(ref);

	// Identify the user. Three paths depending on what kind of payment
	// was disputed:
	//   - preapproval recurring → match by payer email or customerId
	//   - pixrenew              → ref carries userId
	//   - creditpack            → ref carries orgId (no plan suspension,
	//                             but we still log; credits already
	//                             granted, accountant follow-up)
	let userId: string | null = null;
	let orgId: string | null = null;

	if (parsed.tag === "pixrenew") {
		userId = parsed.parts[1] || null;
		orgId = parsed.parts[0] || null;
	} else if (parsed.tag === "creditpack") {
		orgId = parsed.parts[0] || null;
	}

	if (!userId && payment.payer?.email) {
		const u = await findUserByPayer(undefined, payment.payer.email);
		if (u) {
			userId = u.id;
			if (!orgId) {
				const org = await findUserOrg(u.id);
				orgId = org?.id ?? null;
			}
		}
	}

	if (parsed.tag === "creditpack") {
		// Credits already granted; we don't auto-revoke (refund accounting
		// is messy and the dispute might still be lost). Just suspend the
		// org so further actions need human approval, and log.
		if (orgId) {
			await prisma.organization.update({
				where: { id: orgId },
				data: { status: "suspended" },
			});
		}
		log("chargeback.creditpack", `org=${orgId} chargeback=${cb.id} payment=${cb.payment_id}`);
		return;
	}

	// Subscription / PIX-renewal disputes: suspend + cancel preapproval.
	if (orgId) {
		await prisma.organization.update({
			where: { id: orgId },
			data: { status: "suspended" },
		});
	}
	if (userId) {
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (user?.mpPreapprovalId) {
			try {
				await cancelPreapproval(user.mpPreapprovalId);
				log("chargeback.preapproval-cancelled", `user=${userId} preapproval=${user.mpPreapprovalId}`);
			} catch (err) {
				console.error(`[MP Webhook] chargeback cancelPreapproval failed: ${(err as Error).message}`);
			}
		}
		await prisma.user.update({
			where: { id: userId },
			data: {
				subscriptionId: null,
				mpPreapprovalId: null,
				priceId: null,
				currentPeriodEnd: null,
			},
		});
	}

	log("chargeback.suspended", `user=${userId} org=${orgId} chargeback=${cb.id} status=${cb.status}`);
}

async function reconcileCreditPack(payment: MpPaymentResponse, refParts: string[]) {
	if (payment.status !== "approved") {
		log("creditpack.skip", `payment=${payment.id} status=${payment.status} (waiting for approval)`);
		return;
	}
	const [orgId, packKey] = refParts;
	if (!orgId || !packKey) {
		log("creditpack.bad-ref", `payment=${payment.id} parts=${refParts.join("/")}`);
		return;
	}
	const { findPackByKey } = await import("@/libs/credit-packs");
	const pack = await findPackByKey(packKey);
	if (!pack) {
		log("creditpack.unknown-pack", `pack=${packKey} payment=${payment.id}`);
		return;
	}
	const { addPurchasedCredits } = await import("../../../../../apps/platform/credits");
	const result = await addPurchasedCredits(orgId, pack.credits, {
		packKey: pack.key,
		paddleTransactionId: String(payment.id), // column reused for any provider; see schema comment
		note: `MP ${payment.id} · ${pack.label}`,
	});
	log(
		result.alreadyProcessed ? "creditpack.dedup" : "creditpack.credit",
		`org=${orgId} pack=${pack.key} +${pack.credits} payment=${payment.id}`,
	);
}

// ──────────────────────────────────────────────
// POST entry
// ──────────────────────────────────────────────

export const POST = withErrorTracking(
	async function POST(req: NextRequest) {
		const raw = await req.text();
		if (!raw) {
			return NextResponse.json({ error: "Empty body" }, { status: 400 });
		}

		let payload: any;
		try {
			payload = JSON.parse(raw);
		} catch {
			return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
		}

		// Data id can live on the body or the query string depending on
		// notification format (v1 IPN vs new webhook). Try both.
		const url = new URL(req.url);
		const dataId =
			payload?.data?.id?.toString() ||
			url.searchParams.get("data.id") ||
			url.searchParams.get("id") ||
			"";

		// Signature verify is mandatory in production. Allow bypass ONLY
		// when no secret is configured (e.g. local smoke before MP
		// dashboard is set up). This mirrors paddle's "reject if
		// configured but invalid" rather than silently trusting.
		if (process.env.MP_WEBHOOK_SECRET) {
			const ok = verifyMpWebhookSignature(
				{
					signature: req.headers.get("x-signature"),
					requestId: req.headers.get("x-request-id"),
				},
				dataId,
			);
			if (!ok) {
				log("signature.invalid", `dataId=${dataId} type=${payload?.type ?? payload?.topic ?? "?"}`);
				return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
			}
		} else {
			log("signature.skipped", "MP_WEBHOOK_SECRET not set — accepting unsigned webhook (dev only)");
		}

		// Event id — MP uses `id` for the notification itself (distinct
		// from data.id which is the resource id). Older format uses
		// notification_id. Fall back to (type+dataId+action) so we still
		// dedupe when MP omits a unique id.
		const eventKey =
			payload?.id?.toString() ||
			payload?.notification_id?.toString() ||
			`${payload?.type ?? payload?.topic ?? "unknown"}:${dataId}:${payload?.action ?? ""}`;
		if (dedupe(eventKey)) {
			return NextResponse.json({ message: "Already processed" }, { status: 200 });
		}

		// `type` is the v2 webhook field; older IPN sends `topic`. Both
		// land here; we normalize.
		const type: string = payload?.type || payload?.topic || "";
		const action: string = payload?.action || "";
		log("recv", `type=${type} action=${action} dataId=${dataId}`);

		try {
			if (type === "payment") {
				if (!dataId) {
					log("payment.no-id", JSON.stringify(payload).slice(0, 200));
				} else {
					await handlePaymentEvent(dataId);
				}
			} else if (type === "preapproval" || type === "subscription_preapproval") {
				if (!dataId) {
					log("preapproval.no-id", JSON.stringify(payload).slice(0, 200));
				} else {
					await handlePreapprovalEvent(dataId);
				}
			} else if (type === "chargebacks" || type === "chargeback") {
				if (!dataId) {
					log("chargeback.no-id", JSON.stringify(payload).slice(0, 200));
				} else {
					await handleChargebackEvent(dataId);
				}
			} else if (type === "authorized_payment" || type === "subscription_authorized_payment") {
				// A successful charge from an existing preapproval. The
				// payload references the payment id, so we route through
				// the same payment handler — `pixrenew`/`creditpack` refs
				// won't match (these are card recurrings), so we just
				// extend currentPeriodEnd inline.
				if (dataId) {
					const payment = await getPayment(dataId);
					if (payment.status === "approved") {
						const user = await findUserByPayer(undefined, payment.payer?.email);
						if (user) {
							const base = user.currentPeriodEnd && user.currentPeriodEnd > new Date()
								? user.currentPeriodEnd
								: new Date();
							const nextPeriodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
							await prisma.user.update({
								where: { id: user.id },
								data: {
									paymentProvider: "mercadopago",
									currentPeriodEnd: nextPeriodEnd,
								},
							});
							log("authorized_payment.extend", `user=${user.id} until=${nextPeriodEnd.toISOString()}`);
						}
					}
				}
			} else {
				log("unhandled", `type=${type} action=${action}`);
			}
		} catch (err) {
			console.error("[MP Webhook] handler error:", err);
			// Re-throw so MP retries via the outer try/catch wrapper.
			throw err;
		}

		// MP requires 200 within ~22s. We're under that easily; respond
		// promptly so MP doesn't mark this delivery as failed.
		return NextResponse.json({ message: "OK" }, { status: 200 });
	},
	{ endpoint: "/api/mercadopago/webhook", method: "POST" },
);
