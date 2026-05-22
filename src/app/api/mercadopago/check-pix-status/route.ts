import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getPayment, isMpConfigured } from "@/libs/mp-api";

// ──────────────────────────────────────────────
// POST /api/mercadopago/check-pix-status
//
// Client-side poll while the QR modal is open. Looks up the PixCharge
// (scoped to the authenticated user — never trust a chargeId from the
// payload by itself), then fetches fresh state from MP. We DO NOT
// mutate the DB here — that's the webhook's job. If the user's PIX
// has already been confirmed by the webhook, we just return the
// current row state.
//
// Returning `status='approved'` ends the poll loop client-side; UI
// shows the success state and triggers session.update().
// ──────────────────────────────────────────────

const bodySchema = z.object({
	chargeId: z.string().min(1),
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

		const parsed = bodySchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ message: "Invalid payload", errors: parsed.error.flatten().fieldErrors },
				{ status: 400 },
			);
		}
		const { chargeId } = parsed.data;
		const userId = (session.user as any).id as string;

		const charge = await prisma.pixCharge.findUnique({ where: { id: chargeId } });
		if (!charge || charge.userId !== userId) {
			return NextResponse.json({ message: "Charge not found" }, { status: 404 });
		}

		// Already settled per our records — short-circuit, no MP call.
		if (charge.status === "approved" || charge.status === "rejected" || charge.status === "cancelled") {
			return NextResponse.json(
				{
					chargeId: charge.id,
					status: charge.status,
					paidAt: charge.paidAt,
				},
				{ status: 200 },
			);
		}

		// Pull fresh state from MP. We don't write to DB — the webhook
		// owns that and prevents race conditions between this poll
		// path and the webhook handler.
		if (!charge.mpPaymentId) {
			return NextResponse.json(
				{ chargeId: charge.id, status: "pending", remote: "no-mp-payment-yet" },
				{ status: 200 },
			);
		}
		try {
			const payment = await getPayment(charge.mpPaymentId);
			return NextResponse.json(
				{
					chargeId: charge.id,
					status: payment.status === "approved" ? "approved" : charge.status,
					remoteStatus: payment.status,
					paidAt: payment.date_approved ?? null,
				},
				{ status: 200 },
			);
		} catch (err) {
			console.error(`[mp] check-pix-status MP fetch failed: ${(err as Error).message}`);
			return NextResponse.json(
				{ chargeId: charge.id, status: charge.status, remote: "fetch-failed" },
				{ status: 200 },
			);
		}
	},
	{ endpoint: "/api/mercadopago/check-pix-status", method: "POST" },
);

export { POST };
