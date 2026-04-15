import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// GET /api/lead/[id]/checkout-context
//
// Companion to GET /api/lead/[id] — that endpoint redacts email for
// the public share link. This one returns the unmasked email so the
// result page can pre-fill Paddle.Checkout.open({ customer: { email } }).
//
// Only returns the email when the lead is in `audit_complete` — pre-
// audit leads have no completed funnel state and shouldn't need a
// checkout handoff. Leads in `checkout_started` / `converted` also
// return the email so a refresh during payment still pre-fills.
//
// The endpoint is public in the same sense /api/lead/[id] is public:
// the leadId is a cuid (~128 bits of guessability), the content is
// the visitor's own contact info, and the page renders same-origin
// right before opening Paddle. The reason we split this path from
// the main GET is purely operational — emailing logs or screenshots
// of the share URL don't now leak an unmasked email.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

const ELIGIBLE_STATUSES = new Set([
	"audit_complete",
	"checkout_started",
	"converted",
]);

export const GET = withErrorTracking(
	async function GET(
		_request: Request,
		context: { params: Promise<{ id: string }> },
	) {
		const { id } = await context.params;

		const lead = await prisma.anonymousLead.findUnique({
			where: { id },
			select: { id: true, email: true, status: true },
		});

		if (!lead) {
			return NextResponse.json({ message: "Lead not found." }, { status: 404 });
		}

		if (!ELIGIBLE_STATUSES.has(lead.status)) {
			// Not at the pay step — don't leak the email even though the
			// cuid is correct. Returning 404 (vs 409) keeps enumeration
			// and state probing indistinguishable from a missing lead.
			return NextResponse.json({ message: "Lead not found." }, { status: 404 });
		}

		return NextResponse.json({
			email: lead.email ?? null,
		});
	},
	{ endpoint: "/api/lead/[id]/checkout-context", method: "GET" },
);
