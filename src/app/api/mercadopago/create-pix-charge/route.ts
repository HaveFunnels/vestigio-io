import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	buildPixExternalRef,
	centsToReais,
	createPixPayment,
	isMpConfigured,
} from "@/libs/mp-api";
import { getPlanByKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// POST /api/mercadopago/create-pix-charge
//
// Generates a fresh PIX renewal charge for the authenticated user.
// Used both for the "Pay with PIX" button on billing AND by the
// dunning cron (which calls the same handler via internal HTTP or
// the underlying helper — TBD when we wire the cron).
//
// Flow:
//   1. Resolve plan + amount (BRL).
//   2. Mint PixCharge row (status=pending) with a unique
//      externalReference so the webhook can reconcile.
//   3. Call MP /v1/payments → returns qr_code + qr_code_base64.
//   4. Persist mpPaymentId + qr_code on the PixCharge row.
//   5. Return QR data so the UI can render the modal.
//
// We DO NOT block on the webhook here — the row is "pending" until
// MP fires `payment.updated` and the webhook flips it to "approved".
// The client polls via /check-pix-status while the QR modal is open.
// ──────────────────────────────────────────────

const bodySchema = z.object({
	// All three paid tiers are valid for PIX renewal. `free` is the
	// lapsed sentinel — no charge to issue.
	planKey: z.enum(["vestigio", "pro", "max"]).optional(),
	cycle: z.enum(["monthly", "annually"]).default("monthly"),
});

const POST = withErrorTracking(
	async function POST(req: NextRequest) {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}
		if (!isMpConfigured()) {
			return NextResponse.json(
				{ message: "Mercado Pago is not configured on this environment" },
				{ status: 503 },
			);
		}

		const raw = await req.json().catch(() => ({}));
		const parsed = bodySchema.safeParse(raw);
		if (!parsed.success) {
			return NextResponse.json(
				{ message: "Invalid payload", errors: parsed.error.flatten().fieldErrors },
				{ status: 400 },
			);
		}
		const { cycle } = parsed.data;

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user?.email) {
			return NextResponse.json({ message: "User missing email" }, { status: 400 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			include: { organization: true },
		});
		if (!membership) {
			return NextResponse.json({ message: "User has no organization" }, { status: 400 });
		}

		// Default planKey from the org's current plan. Reject "free"
		// because it's the lapsed/pending sentinel (no charge owed).
		// Starter (`vestigio`) is a PAID tier here — R$ 99 — so PIX is
		// valid for it.
		const planKey = parsed.data.planKey || membership.organization.plan;
		if (planKey === "free") {
			return NextResponse.json(
				{ message: "Pick a paid plan first — free has no PIX charge to issue" },
				{ status: 400 },
			);
		}

		const plan = await getPlanByKey(planKey);
		if (!plan) {
			return NextResponse.json({ message: "Unknown plan" }, { status: 400 });
		}

		const amountCents = cycle === "annually"
			? (plan.monthlyPriceCentsBrl ?? 0) * 10 // matches ANNUAL_DISCOUNT_MULTIPLIER
			: plan.monthlyPriceCentsBrl ?? 0;
		if (!amountCents) {
			return NextResponse.json(
				{ message: `Plan ${planKey} has no BRL price configured` },
				{ status: 503 },
			);
		}

		// Cycle due date — for first-time PIX subs, that's "now + 1 day"
		// (just give them 24h to pay). For renewals, the cron will set
		// dueAt = currentPeriodEnd so the reminder math is consistent.
		const dueAt = user.currentPeriodEnd && user.currentPeriodEnd > new Date()
			? user.currentPeriodEnd
			: new Date(Date.now() + 24 * 60 * 60 * 1000);

		const nonce = crypto.randomBytes(6).toString("hex");
		const externalReference = buildPixExternalRef({
			orgId: membership.organization.id,
			userId: user.id,
			cycleDueAt: dueAt,
			nonce,
		});

		// Create the PixCharge row FIRST (idempotency anchor — if MP
		// call fails after this, we have a "pending" row we can retry
		// against without double-creating).
		const charge = await prisma.pixCharge.create({
			data: {
				userId: user.id,
				organizationId: membership.organization.id,
				amountCents,
				planKey,
				cycle,
				dueAt,
				externalReference,
				status: "pending",
			},
		});

		const siteUrl = process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
		const notificationUrl =
			process.env.MP_PREAPPROVAL_NOTIFICATION_URL || `${siteUrl}/api/mercadopago/webhook`;

		try {
			const payment = await createPixPayment({
				amountBrl: centsToReais(amountCents),
				payerEmail: user.email,
				description: `Vestigio ${plan.label} — ${cycle === "annually" ? "Anual" : "Mensal"}`,
				externalReference,
				notificationUrl,
				idempotencyKey: externalReference,
				metadata: {
					orgId: membership.organization.id,
					userId: user.id,
					planKey,
					cycle,
				},
			});

			const qrData = payment.point_of_interaction?.transaction_data;
			await prisma.pixCharge.update({
				where: { id: charge.id },
				data: {
					mpPaymentId: String(payment.id),
					qrCode: qrData?.qr_code ?? null,
					qrCodeBase64: qrData?.qr_code_base64 ?? null,
					ticketUrl: qrData?.ticket_url ?? null,
					expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
				},
			});

			return NextResponse.json(
				{
					chargeId: charge.id,
					mpPaymentId: String(payment.id),
					amountCents,
					qrCode: qrData?.qr_code ?? null,
					qrCodeBase64: qrData?.qr_code_base64 ?? null,
					ticketUrl: qrData?.ticket_url ?? null,
					expiresAt: payment.date_of_expiration ?? null,
					status: "pending",
				},
				{ status: 200 },
			);
		} catch (err) {
			// Bookkeeping: mark the row as failed so the next click
			// creates a brand-new charge instead of reusing a stuck row.
			await prisma.pixCharge.update({
				where: { id: charge.id },
				data: { status: "rejected" },
			});
			throw err;
		}
	},
	{ endpoint: "/api/mercadopago/create-pix-charge", method: "POST" },
);

export { POST };
