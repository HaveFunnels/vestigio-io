import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	centsToReais,
	createPixPayment,
	isMpConfigured,
} from "@/libs/mp-api";
import { getPlanByKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// POST /api/mercadopago/paywall/pix
//
// Generates a fresh PIX charge for the post-signup /activate paywall.
// Differs from /api/mercadopago/create-pix-charge (the billing-page
// renewal endpoint) in two ways:
//
//   1. Audience: brand-new users who just finished /auth/signup. No
//      existing Organization or Membership yet — those get created by
//      the webhook (C22e) when the payment lands. We don't write a
//      PixCharge row here because PixCharge requires an organizationId
//      FK; the webhook owns the lazy org+membership materialization.
//
//   2. External reference shape: prefix `pw_pix_` (vs `pixrenew:`) so
//      the MP webhook router can branch on it without ambiguity.
//      Format:
//        pw_pix_<userId>_<planKey>_<cycle>_<leadIdOrNone>_<nonce>
//
// Trade-off acknowledged: no DB row means we lose the user-facing
// "recover incomplete Pix" path if the network fails between MP
// returning the QR and the browser receiving it. The webhook still
// reconciles on its own when MP fires payment.created with our
// external_reference, so dropped responses don't lose money — they
// just lose UX.
// ──────────────────────────────────────────────

const bodySchema = z.object({
	planKey: z.enum(["vestigio", "pro", "max"]),
	cycle: z.enum(["monthly", "annually"]).default("monthly"),
	leadId: z.string().optional(),
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
		const { planKey, cycle, leadId } = parsed.data;

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user?.email) {
			return NextResponse.json({ message: "User missing email" }, { status: 400 });
		}

		const plan = await getPlanByKey(planKey);
		if (!plan) {
			return NextResponse.json({ message: "Unknown plan" }, { status: 400 });
		}

		// BRL price — admin-managed monthlyPriceCentsBrl when available,
		// else fall back to monthlyPriceCents (existing schema field) so
		// dev envs without BRL sync still produce a charge.
		const monthlyCentsBrl =
			(plan as any).monthlyPriceCentsBrl ?? plan.monthlyPriceCents;
		const amountCents =
			cycle === "annually" ? monthlyCentsBrl * 10 : monthlyCentsBrl;
		const amountBrl = centsToReais(amountCents);

		if (!amountBrl || amountBrl <= 0) {
			return NextResponse.json(
				{ message: "Plan has no BRL price configured" },
				{ status: 503 },
			);
		}

		const nonce = crypto.randomBytes(6).toString("hex");
		const externalReference = [
			"paywall_pix",
			userId,
			planKey,
			cycle,
			leadId ?? "none",
			nonce,
		].join(":");

		const description = `Vestigio ${plan.label} — ${cycle === "annually" ? "anual" : "mensal"}`;

		// MP rejects notification_url when it's empty, localhost-ish, or
		// otherwise not a real https URL. In dev we omit it entirely;
		// the UI poll path (/api/mercadopago/paywall/status/[paymentId])
		// covers the confirmation flow when webhooks aren't wired. In
		// prod NEXT_PUBLIC_APP_URL must be a public https origin for
		// the webhook to land.
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		const notificationUrl =
			appUrl.startsWith("https://") && !appUrl.includes("localhost")
				? `${appUrl}/api/mercadopago/webhook`
				: undefined;

		const mpResp = await createPixPayment({
			amountBrl,
			payerEmail: user.email,
			description,
			externalReference,
			notificationUrl,
			expiresInMinutes: 30, // tight TTL on the QR; UI surfaces a "gerar novo" recourse
			idempotencyKey: externalReference,
			metadata: {
				flow: "paywall",
				userId,
				planKey,
				cycle,
				leadId: leadId ?? null,
			},
		});

		return NextResponse.json({
			paymentId: String(mpResp.id),
			qrCode: mpResp.point_of_interaction?.transaction_data?.qr_code ?? "",
			qrCodeBase64:
				mpResp.point_of_interaction?.transaction_data?.qr_code_base64 ?? "",
			ticketUrl:
				mpResp.point_of_interaction?.transaction_data?.ticket_url ?? null,
			amountCents,
			expiresAt: mpResp.date_of_expiration,
		});
	},
	{ endpoint: "/api/mercadopago/paywall/pix", method: "POST" },
);

export { POST };
