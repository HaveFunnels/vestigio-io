import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	cancelPreapproval,
	createPreapproval,
	isMpConfigured,
} from "@/libs/mp-api";
import { getPlanByKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// POST /api/mercadopago/change-plan
//
// MP PreApproval doesn't expose a "change plan template" mutation —
// auto_recurring fields are tied to the source preapproval_plan_id.
// To swap plans we:
//   1. Cancel the existing preapproval (MP refunds any over-pay on
//      its own side per their proration rules).
//   2. Create a new preapproval against the target plan, reusing the
//      card on file by NOT sending cardTokenId — MP will email the
//      customer to confirm if needed; in practice most subscribers
//      need to re-tokenize via Bricks. The billing UI handles that.
//
// Returns `{ initPoint, requiresTokenization }` so the client knows
// whether to redirect (MP hosted) or open Bricks Card again.
// ──────────────────────────────────────────────

const bodySchema = z.object({
	planKey: z.enum(["vestigio", "pro", "max"]),
	cycle: z.enum(["monthly", "annually"]).default("monthly"),
	cardTokenId: z.string().optional(),
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
		const { planKey, cycle, cardTokenId } = parsed.data;

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user?.email) {
			return NextResponse.json({ message: "User missing email" }, { status: 400 });
		}
		if (!user.mpPreapprovalId) {
			return NextResponse.json(
				{ message: "No active Mercado Pago subscription to change" },
				{ status: 404 },
			);
		}

		const plan = await getPlanByKey(planKey);
		if (!plan) {
			return NextResponse.json({ message: "Unknown plan" }, { status: 400 });
		}
		const preapprovalPlanId =
			cycle === "annually" ? plan.mpAnnualPreapprovalPlanId : plan.mpPreapprovalPlanId;
		if (!preapprovalPlanId) {
			return NextResponse.json(
				{ message: `Plan ${planKey} (${cycle}) is not provisioned on MP yet` },
				{ status: 503 },
			);
		}

		// Cancel old (idempotent on MP side). Webhook will downgrade
		// the org to vestigio — that's intentional churn protection,
		// we'll re-upgrade as soon as the new preapproval activates.
		await cancelPreapproval(user.mpPreapprovalId);

		const nonce = crypto.randomBytes(8).toString("hex");
		const externalReference = `preapproval:${user.id}:${planKey}:${cycle}:${nonce}`;
		const siteUrl = process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
		const backUrl = `${siteUrl}/app/billing?mp=change-plan`;
		const notificationUrl =
			siteUrl.startsWith("https://") && !siteUrl.includes("localhost")
				? `${siteUrl}/api/mercadopago/webhook`
				: undefined;

		const sub = await createPreapproval({
			preapprovalPlanId,
			payerEmail: user.email,
			externalReference,
			backUrl,
			cardTokenId,
			idempotencyKey: externalReference,
			notificationUrl,
		});

		return NextResponse.json(
			{
				preapprovalId: sub.id,
				status: sub.status,
				initPoint: sub.init_point ?? null,
				requiresTokenization: !cardTokenId && !!sub.init_point,
			},
			{ status: 200 },
		);
	},
	{ endpoint: "/api/mercadopago/change-plan", method: "POST" },
);

export { POST };
