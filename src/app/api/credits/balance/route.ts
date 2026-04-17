import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { resolveOrgContext } from "@/libs/resolve-org";

/**
 * GET /api/credits/balance — authenticated credit balance for the
 * caller's active org. Returns both plan-included remainder (resets
 * on cycle rollover) and purchased balance (carries over).
 *
 * The BuyCreditsModal consumes this to render "you have X credits —
 * buy more?" and to hide the purchase CTA for non-Max plans.
 */
export const GET = withErrorTracking(
	async function GET() {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const orgCtx = await resolveOrgContext();
		if (!orgCtx.orgId || orgCtx.orgType === "demo") {
			return NextResponse.json(
				{
					orgId: null,
					plan: orgCtx.plan,
					planIncluded: 0,
					remaining: 0,
					purchased: 0,
					consumed: 0,
					available: 0,
					canPurchase: false,
				},
				{ status: 200 },
			);
		}

		const { getCreditBalance } = await import(
			"../../../../../apps/platform/credits"
		);
		const balance = await getCreditBalance(orgCtx.orgId, orgCtx.plan as any);

		return NextResponse.json({
			orgId: orgCtx.orgId,
			plan: orgCtx.plan,
			planIncluded: balance.plan_included,
			remaining: Math.max(0, balance.plan_included - balance.consumed),
			purchased: balance.purchased,
			consumed: balance.consumed,
			available: balance.available,
			canPurchase: orgCtx.plan === "max",
		});
	},
	{ endpoint: "/api/credits/balance", method: "GET" },
);
