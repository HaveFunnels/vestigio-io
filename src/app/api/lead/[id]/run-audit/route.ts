import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { verifyFormToken } from "@/libs/lead-defense";

// ──────────────────────────────────────────────
// POST /api/lead/[id]/run-audit
//
// Fires the mini-audit worker fire-and-forget. Called by the frontend
// after step 4 of the /audit form is persisted (PATCH .../step/4
// returned ok). Returns immediately so the frontend can redirect to
// the result page where polling takes over.
//
// SEC-04 fix: Requires the form session token (X-Vestigio-Form-Session
// header) to prevent unauthenticated SSRF via arbitrary lead IDs.
//
// The worker (apps/audit-runner/run-mini-audit.ts) runs the staged
// pipeline in shallow mode, persists MiniAuditResult, and updates
// the lead status from `auditing` → `audit_complete`.
//
// Pre-requisites: lead must have status='draft' AND domain set.
// Multiple POSTs to the same lead are idempotent (worker checks
// status before re-firing).
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	// SEC-04: Verify form session token to prevent unauthenticated SSRF
	const formToken = request.headers.get("x-vestigio-form-session");
	const realIp = request.headers.get("x-real-ip");
	const forwarded = request.headers.get("x-forwarded-for");
	const clientIp = realIp?.trim() || (forwarded ? forwarded.split(",").pop()!.trim() : "0.0.0.0");
	const verification = verifyFormToken(formToken, clientIp);
	if (!verification.valid) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const { id } = await context.params;

	const lead = await prisma.anonymousLead.findUnique({
		where: { id },
		select: { id: true, status: true, domain: true, email: true },
	});

	if (!lead) {
		return NextResponse.json({ message: "Lead not found." }, { status: 404 });
	}

	if (!lead.domain) {
		return NextResponse.json(
			{ message: "Domain missing — complete step 2 first." },
			{ status: 400 },
		);
	}

	if (!lead.email) {
		return NextResponse.json(
			{ message: "Email missing — complete step 4 first." },
			{ status: 400 },
		);
	}

	// Idempotent — worker handles its own state guard
	if (lead.status === "auditing") {
		return NextResponse.json({ status: "auditing" });
	}
	if (lead.status === "audit_complete") {
		return NextResponse.json({ status: "audit_complete" });
	}
	if (lead.status === "spam") {
		// Pretend it's running so the bot doesn't get useful info
		return NextResponse.json({ status: "auditing" });
	}

	// Fire-and-forget — worker runs in background, lead status flips
	// to `auditing` immediately so the polling knows what's happening.
	import("../../../../../../apps/audit-runner/run-mini-audit")
		.then((m) => m.runMiniAudit(id))
		.catch((err) => {
			console.error(`[lead-run-audit] dispatch failed for ${id}:`, err);
		});

	return NextResponse.json({ status: "auditing" });
}
