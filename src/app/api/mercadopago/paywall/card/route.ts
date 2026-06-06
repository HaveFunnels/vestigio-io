import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	centsToReais,
	createCardPayment,
	isMpConfigured,
} from "@/libs/mp-api";
import { getPlanByKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// POST /api/mercadopago/paywall/card
//
// One-shot card charge for the post-signup paywall. Token comes from
// the MP cardForm client SDK (paywall UI tokenizes locally → posts
// token here → we charge).
//
// First-month-only flow:
//   - This endpoint charges ONE billing period upfront (matches the
//     Pix path's first-charge semantics).
//   - Renewal switches to MP Preapproval when the webhook activates
//     the user's subscription (C22e wires that). The cardholder is
//     prompted before the second cycle.
//
// Like the Pix endpoint, no DB row is written here — the webhook
// (C22e) owns org/membership materialization keyed on the external
// reference embedded in the payment.
// ──────────────────────────────────────────────

const bodySchema = z.object({
	planKey: z.enum(["vestigio", "pro", "max"]),
	cycle: z.enum(["monthly", "annually"]).default("monthly"),
	leadId: z.string().optional(),
	cardTokenId: z.string(),
	paymentMethodId: z.string(), // "visa" | "master" | "amex" | "elo" | ...
	installments: z.number().int().min(1).max(12).default(1),
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
		const { planKey, cycle, leadId, cardTokenId, paymentMethodId, installments } = parsed.data;

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user?.email) {
			return NextResponse.json({ message: "User missing email" }, { status: 400 });
		}

		const plan = await getPlanByKey(planKey);
		if (!plan) {
			return NextResponse.json({ message: "Unknown plan" }, { status: 400 });
		}

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
			"pw",
			"card",
			userId,
			planKey,
			cycle,
			leadId ?? "none",
			nonce,
		].join("_");

		const description = `Vestigio ${plan.label} — ${cycle === "annually" ? "anual" : "mensal"}`;

		const mpResp = await createCardPayment({
			amountBrl,
			cardTokenId,
			installments,
			paymentMethodId,
			payerEmail: user.email,
			description,
			externalReference,
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
			status: mpResp.status,
			statusDetail: mpResp.status_detail,
		});
	},
	{ endpoint: "/api/mercadopago/paywall/card", method: "POST" },
);

export { POST };
