import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";

/**
 * POST /api/lead/[id]/checkout-started
 *
 * BUG-11 fix: Transitions lead status to 'checkout_started' when
 * the Paddle overlay opens. This:
 * 1. Prevents the result page expiration timer from firing mid-checkout
 * 2. Enables analytics to distinguish "abandoned checkout" from "never reached"
 *
 * Fire-and-forget from the frontend — failure is non-fatal.
 */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	await prisma.anonymousLead.updateMany({
		where: {
			id,
			status: { in: ["audit_complete"] }, // Only transition from audit_complete
		},
		data: { status: "checkout_started" },
	});

	return NextResponse.json({ ok: true });
}
