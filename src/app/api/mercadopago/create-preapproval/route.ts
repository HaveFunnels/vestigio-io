import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { z } from "zod";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { createPreapproval, isMpConfigured } from "@/libs/mp-api";
import { getPlanByKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// POST /api/mercadopago/create-preapproval
//
// Starts a recurring subscription on MP. Two code paths:
//
//   (a) `cardTokenId` supplied (Bricks Card tokenized in-browser)
//       → MP charges immediately and returns `status=authorized`. We
//       respond with `{ initPoint: null }` so the client treats this
//       as terminal success and shows the post-checkout state.
//
//   (b) No card token → MP returns `init_point` URL. We respond with
//       `{ initPoint }` and the client redirects there. The user
//       tokenizes on MP and lands back on `backUrl`.
//
// The actual User / Org state mutation is done by the webhook, NOT
// here. That keeps signup behavior consistent for cards that fall
// into `pending` (e.g. 3DS) — we never optimistically activate.
// ──────────────────────────────────────────────

const bodySchema = z.object({
	// All three are PAID tiers; `free` is reserved for lapsed/pending
	// state and has no checkout.
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

		const plan = await getPlanByKey(planKey);
		if (!plan) {
			return NextResponse.json({ message: "Unknown plan" }, { status: 400 });
		}
		const preapprovalPlanId =
			cycle === "annually" ? plan.mpAnnualPreapprovalPlanId : plan.mpPreapprovalPlanId;
		if (!preapprovalPlanId) {
			return NextResponse.json(
				{ message: `Plan ${planKey} (${cycle}) is not provisioned on MP yet — admin must sync` },
				{ status: 503 },
			);
		}

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user || !user.email) {
			return NextResponse.json({ message: "User missing email" }, { status: 400 });
		}

		const nonce = crypto.randomBytes(8).toString("hex");
		const externalReference = `preapproval:${user.id}:${planKey}:${cycle}:${nonce}`;
		const siteUrl = process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
		const backUrl = `${siteUrl}/app/billing?mp=preapproval`;

		const sub = await createPreapproval({
			preapprovalPlanId,
			payerEmail: user.email,
			externalReference,
			backUrl,
			cardTokenId,
			idempotencyKey: externalReference,
		});

		return NextResponse.json(
			{
				preapprovalId: sub.id,
				status: sub.status,
				initPoint: sub.init_point ?? null,
			},
			{ status: 200 },
		);
	},
	{ endpoint: "/api/mercadopago/create-preapproval", method: "POST" },
);

export { POST };
