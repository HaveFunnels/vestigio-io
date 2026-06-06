import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { getPayment, isMpConfigured } from "@/libs/mp-api";

// ──────────────────────────────────────────────
// GET /api/mercadopago/paywall/status/[paymentId]
//
// Poll endpoint used by /activate while a Pix QR is on screen.
// The client polls every few seconds; we forward to MP's
// /v1/payments/{id} and return a slimmed status payload.
//
// We do NOT call the webhook from here — the webhook is the
// source of truth for org/membership materialization. This
// endpoint exists purely so the UI can flip from
// "Aguardando pagamento…" to a success state without waiting
// for a separate page load.
// ──────────────────────────────────────────────

const GET = withErrorTracking(
	async function GET(
		_req: NextRequest,
		ctx: { params: Promise<{ paymentId: string }> },
	) {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}
		if (!isMpConfigured()) {
			return NextResponse.json(
				{ message: "Mercado Pago is not configured" },
				{ status: 503 },
			);
		}

		const { paymentId } = await ctx.params;
		if (!paymentId) {
			return NextResponse.json({ message: "Missing paymentId" }, { status: 400 });
		}

		const payment = await getPayment(paymentId);

		// Verify the payment belongs to THIS user — the external_reference
		// carries the userId so we can compare without an extra DB read.
		// Format: paywall_pix:userId:planKey:cycle:leadIdOrNone:nonce
		const ref = payment.external_reference ?? "";
		const sessionUserId = (session.user as any).id as string;
		if (
			(ref.startsWith("paywall_pix:") || ref.startsWith("paywall_card:")) &&
			ref.split(":")[1] !== sessionUserId
		) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		return NextResponse.json({
			status: payment.status, // "approved" | "pending" | "in_process" | "rejected" | ...
			statusDetail: payment.status_detail,
			approvedAt: payment.date_approved,
		});
	},
	{ endpoint: "/api/mercadopago/paywall/status/[paymentId]", method: "GET" },
);

export { GET };
