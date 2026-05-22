import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { cancelPreapproval, isMpConfigured } from "@/libs/mp-api";

// ──────────────────────────────────────────────
// POST /api/mercadopago/cancel
//
// Cancels the authenticated user's MP recurring subscription. We
// always resolve the preapproval id server-side (never from the
// request body) so a forged payload can't cancel another user's sub.
//
// MP-side cancel is idempotent. We optimistically clear the user's
// subscription fields here AND wait for the webhook to confirm —
// the webhook does the downgrade of Organization.plan so refresh of
// session reflects state correctly.
// ──────────────────────────────────────────────

const POST = withErrorTracking(
	async function POST(_req: NextRequest) {
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

		const userId = (session.user as any).id as string;
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user?.mpPreapprovalId) {
			return NextResponse.json(
				{ message: "No active Mercado Pago subscription to cancel" },
				{ status: 404 },
			);
		}

		await cancelPreapproval(user.mpPreapprovalId);
		return NextResponse.json({ message: "Cancellation requested" }, { status: 200 });
	},
	{ endpoint: "/api/mercadopago/cancel", method: "POST" },
);

export { POST };
