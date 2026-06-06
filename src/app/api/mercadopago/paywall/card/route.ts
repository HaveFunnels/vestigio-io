import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	createPreapproval,
	isMpConfigured,
} from "@/libs/mp-api";
import { getPlanByKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// POST /api/mercadopago/paywall/card
//
// Sets up a recurring MP Preapproval for the post-signup paywall.
// The cardForm SDK tokenizes the card client-side → posts the token
// here → we mint a Preapproval against the plan's mpPreapprovalPlanId
// (admin-synced; see /api/admin/mp-sync). MP charges immediately
// (status=authorized) and then auto-renews every cycle.
//
// Why preapproval and not a one-shot payment:
//   - The buyer ends up with a real subscription that renews without
//     coming back — what they expect of a SaaS card flow.
//   - Failure handling (declines, expiries, retries) is handled by
//     MP + our existing webhook handlers; no separate dunning code.
//
// External reference shape extends the existing `preapproval:` prefix
// the billing-page renewal flow uses, with a "paywall" marker so the
// webhook router can lazy-materialize org + membership for fresh
// signups (billing-page renewals already have an org):
//   preapproval:<userId>:paywall:<planKey>:<cycle>:<leadIdOrNone>:<nonce>
// ──────────────────────────────────────────────

const bodySchema = z.object({
	planKey: z.enum(["vestigio", "pro", "max"]),
	cycle: z.enum(["monthly", "annually"]).default("monthly"),
	leadId: z.string().optional(),
	cardTokenId: z.string(),
	// kept on the wire for compat with the C22d client but no longer
	// used — preapproval picks the payment method off the token.
	paymentMethodId: z.string().optional(),
	installments: z.number().int().min(1).max(12).optional(),
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
		const { planKey, cycle, leadId, cardTokenId } = parsed.data;

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user?.email) {
			return NextResponse.json({ message: "User missing email" }, { status: 400 });
		}

		const plan = await getPlanByKey(planKey);
		if (!plan) {
			return NextResponse.json({ message: "Unknown plan" }, { status: 400 });
		}

		// Resolve which preapproval plan ID to attach. Admin syncs these
		// via /api/admin/mp-sync per plan + cycle; without an ID we can't
		// create the subscription — surface a clean error instead of a
		// silent 4xx from MP.
		const preapprovalPlanId =
			cycle === "annually"
				? (plan as any).mpAnnualPreapprovalPlanId
				: (plan as any).mpPreapprovalPlanId;
		if (!preapprovalPlanId) {
			return NextResponse.json(
				{
					message:
						"Plano de assinatura não configurado para este ciclo. Tente Pix ou contate o suporte.",
				},
				{ status: 503 },
			);
		}

		const nonce = crypto.randomBytes(6).toString("hex");
		// Format extends the existing preapproval ref convention with a
		// "paywall" marker in slot 1 so the webhook router knows to
		// lazy-materialize org+membership when no membership exists yet.
		// Billing-page renewals don't include "paywall" and skip that
		// branch.
		const externalReference = [
			"preapproval",
			userId,
			"paywall",
			planKey,
			cycle,
			leadId ?? "none",
			nonce,
		].join(":");

		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vestigio.io";

		const mpResp = await createPreapproval({
			preapprovalPlanId,
			payerEmail: user.email,
			externalReference,
			backUrl: `${appUrl}/app`,
			cardTokenId,
			idempotencyKey: externalReference,
		});

		return NextResponse.json({
			preapprovalId: mpResp.id,
			status: mpResp.status,
		});
	},
	{ endpoint: "/api/mercadopago/paywall/card", method: "POST" },
);

export { POST };
