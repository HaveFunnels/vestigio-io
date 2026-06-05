import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { recordProductEvent } from "@/libs/product-telemetry";

// ──────────────────────────────────────────────
// POST /api/lead/[id]/track
//
// Anonymous LP funnel telemetry endpoint. Routes events to the
// shared ProductEvent table with leadId set + userId/orgId null.
// Spam-resistant via the lead id existence check.
//
// Body: { event, properties?, pathname, sessionId }
// ──────────────────────────────────────────────

const VALID_EVENTS = new Set([
	"lp_audit_landing",
	"lp_audit_form_step",
	"lp_audit_audit_started",
	"lp_audit_result_viewed",
	"lp_audit_cta_clicked",
	"lp_audit_checkout_complete",
]);

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	let body: {
		event?: string;
		properties?: Record<string, unknown> | null;
		pathname?: string;
		sessionId?: string;
	};
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ ok: false }, { status: 400 });
	}

	if (!body.event || !VALID_EVENTS.has(body.event)) {
		return NextResponse.json({ ok: false }, { status: 400 });
	}

	// Lead existence check — cheap rate limiter against forged leadIds.
	const lead = await prisma.anonymousLead.findUnique({
		where: { id },
		select: { id: true, status: true },
	});
	if (!lead || lead.status === "spam") {
		// Silently accept to avoid leaking which IDs are real.
		return NextResponse.json({ ok: true });
	}

	recordProductEvent({
		leadId: lead.id,
		event: body.event,
		properties: body.properties ?? null,
		pathname: typeof body.pathname === "string" ? body.pathname : "/lp/audit",
		sessionId: typeof body.sessionId === "string" ? body.sessionId : lead.id,
	});

	return NextResponse.json({ ok: true });
}
