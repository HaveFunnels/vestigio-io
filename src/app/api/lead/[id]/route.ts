import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// GET /api/lead/[id]
//
// Public endpoint used by:
//   1. /lp/audit form to resume mid-step (refresh-tolerant)
//   2. /lp/audit/result/[leadId] to poll status while audit runs
//   3. The OG image generator (opengraph-image.tsx) to read preview
//
// Returns lead state + (when audit_complete) the linked MiniAuditResult.
// Intentionally public — leadId is a cuid, not guessable, and the
// content is the visitor's own data. Result page is shareable by URL.
//
// We DO redact email/phone in the response since the public share
// link shouldn't expose PII to whoever the visitor sends the URL to.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET(
	_request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	const lead = await prisma.anonymousLead.findUnique({
		where: { id },
		include: {
			miniAudit: true,
		},
	});

	if (!lead) {
		return NextResponse.json({ message: "Lead not found." }, { status: 404 });
	}

	if (lead.status === "expired") {
		return NextResponse.json(
			{ message: "This audit has expired." },
			{ status: 410 },
		);
	}

	// Spam leads pretend to still be auditing forever
	if (lead.status === "spam") {
		return NextResponse.json({
			id: lead.id,
			status: "auditing",
			currentStep: 4,
			domain: null,
			organizationName: null,
			businessModel: null,
			createdAt: lead.createdAt.toISOString(),
			result: null,
		});
	}

	const result = lead.miniAudit
		? {
				id: lead.miniAudit.id,
				preview: JSON.parse(lead.miniAudit.preview),
				visibleFindings: JSON.parse(lead.miniAudit.visibleFindings),
				blurredFindings: JSON.parse(lead.miniAudit.blurredFindings),
				durationMs: lead.miniAudit.durationMs,
				computedAt: lead.miniAudit.computedAt.toISOString(),
			}
		: null;

	return NextResponse.json({
		id: lead.id,
		status: lead.status,
		currentStep: lead.currentStep,
		domain: lead.domain,
		organizationName: lead.organizationName,
		businessModel: lead.businessModel,
		// PII redacted from public response
		emailMasked: lead.email ? maskEmail(lead.email) : null,
		createdAt: lead.createdAt.toISOString(),
		result,
	});
}

function maskEmail(email: string): string {
	const [local, domain] = email.split("@");
	if (!domain) return "***";
	const visibleLocal = local.length > 2 ? local.slice(0, 2) + "•••" : "•••";
	return `${visibleLocal}@${domain}`;
}
