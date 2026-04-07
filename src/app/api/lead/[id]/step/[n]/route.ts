import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import {
	evaluateDefenses,
	FORM_SESSION_HEADER,
	type BehavioralSignals,
} from "@/libs/lead-defense";
import {
	validateLeadDomain,
	validateLeadRevenue,
	validateLeadOrgName,
	validateLeadEmail,
	validateLeadPhone,
} from "@/libs/lead-validation";
import { parseRevenue } from "@/components/form-fields/types";

// ──────────────────────────────────────────────
// PATCH /api/lead/[id]/step/[n]
//
// Persists the data for a specific step of the /lp/audit form. Each
// step submission goes through the full anti-bot defense stack +
// per-step input validation.
//
// Step 1: organization name + business type
// Step 2: domain + ownership confirmation
// Step 3: monthly revenue + average ticket + conversion model
// Step 4: email + phone (terminal — triggers mini-audit)
//
// Step 4 does NOT call the worker itself — it just persists the data
// and returns ok. The frontend then calls POST /api/lead/[id]/run-audit
// separately to fire the audit. This split keeps the step semantics
// uniform and lets the worker route handle its own validation/auth.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

function getClientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0].trim();
	return request.headers.get("x-real-ip") || "0.0.0.0";
}

interface StepBody {
	formToken: string;
	behavioral: BehavioralSignals;
	// Step-specific fields (all optional — server picks the right ones
	// per step number)
	organizationName?: string;
	businessModel?: string;
	domain?: string;
	ownershipConfirmed?: boolean;
	monthlyRevenue?: string; // raw "$50k" — parsed server-side
	averageTicket?: string;
	conversionModel?: string;
	email?: string;
	phone?: string;
	// Honeypot
	website?: string;
}

export async function PATCH(
	request: Request,
	context: { params: Promise<{ id: string; n: string }> },
) {
	const { id, n } = await context.params;
	const stepNum = parseInt(n, 10);

	if (isNaN(stepNum) || stepNum < 1 || stepNum > 4) {
		return NextResponse.json(
			{ message: "Invalid step number." },
			{ status: 400 },
		);
	}

	const lead = await prisma.anonymousLead.findUnique({ where: { id } });
	if (!lead) {
		return NextResponse.json({ message: "Lead not found." }, { status: 404 });
	}

	if (lead.status === "spam") {
		// Honeypot was tripped earlier — return fake success forever
		// so the bot keeps thinking it's working.
		return NextResponse.json({ ok: true, currentStep: stepNum });
	}

	if (lead.status === "converted" || lead.status === "expired") {
		return NextResponse.json(
			{ message: "This lead session is no longer active." },
			{ status: 410 },
		);
	}

	let body: StepBody;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
	}

	const ip = getClientIp(request);
	const headers = request.headers;

	// Run the full defense stack
	const verdict = evaluateDefenses({
		token: body.formToken,
		ip,
		formBody: body as any,
		formStartedAt: lead.formStartedAt,
		behavioral: {
			...body.behavioral,
			hasFormSessionHeader: !!headers.get(FORM_SESSION_HEADER),
		},
	});

	if (verdict.silentSpam) {
		// Honeypot tripped — silently flag and return fake success
		await prisma.anonymousLead.update({
			where: { id },
			data: {
				status: "spam",
				honeypotTripped: true,
			},
		});
		return NextResponse.json({ ok: true, currentStep: stepNum });
	}

	if (!verdict.allowed) {
		return NextResponse.json(
			{ message: "Form session expired or invalid. Please refresh." },
			{ status: 403 },
		);
	}

	// ── Per-step validation + persistence ──

	const updates: Record<string, unknown> = {
		behavioralScore: verdict.score,
		currentStep: Math.max(lead.currentStep, stepNum),
	};

	if (stepNum === 1) {
		const orgCheck = validateLeadOrgName(body.organizationName || "");
		if (!orgCheck.ok) {
			return NextResponse.json(
				{ message: orgCheck.reason, field: "organizationName" },
				{ status: 422 },
			);
		}
		if (!body.businessModel) {
			return NextResponse.json(
				{ message: "Please pick a business type.", field: "businessModel" },
				{ status: 422 },
			);
		}
		updates.organizationName = body.organizationName!.trim();
		updates.businessModel = body.businessModel;
	}

	if (stepNum === 2) {
		const domainCheck = validateLeadDomain(body.domain || "");
		if (!domainCheck.ok) {
			return NextResponse.json(
				{ message: domainCheck.reason, field: "domain" },
				{ status: 422 },
			);
		}
		if (!body.ownershipConfirmed) {
			return NextResponse.json(
				{
					message:
						"Please confirm ownership before we audit your domain.",
					field: "ownershipConfirmed",
				},
				{ status: 422 },
			);
		}
		updates.domain = body.domain!.trim();
	}

	if (stepNum === 3) {
		const revenueParsed = parseRevenue(body.monthlyRevenue || "");
		const revenueCheck = validateLeadRevenue(revenueParsed);
		if (!revenueCheck.ok) {
			return NextResponse.json(
				{ message: revenueCheck.reason, field: "monthlyRevenue" },
				{ status: 422 },
			);
		}
		updates.monthlyRevenue = revenueParsed;
		const ticketParsed = parseRevenue(body.averageTicket || "");
		updates.averageTicket = ticketParsed; // optional, no validation
		if (!body.conversionModel) {
			return NextResponse.json(
				{ message: "Please pick a conversion model.", field: "conversionModel" },
				{ status: 422 },
			);
		}
		updates.conversionModel = body.conversionModel;
	}

	if (stepNum === 4) {
		const emailCheck = validateLeadEmail(body.email || "");
		if (!emailCheck.ok) {
			return NextResponse.json(
				{ message: emailCheck.reason, field: "email" },
				{ status: 422 },
			);
		}
		if (body.phone) {
			const phoneCheck = validateLeadPhone(body.phone, true);
			if (!phoneCheck.ok) {
				return NextResponse.json(
					{ message: phoneCheck.reason, field: "phone" },
					{ status: 422 },
				);
			}
		}
		updates.email = body.email!.trim().toLowerCase();
		updates.phone = body.phone?.trim() || null;
	}

	await prisma.anonymousLead.update({
		where: { id },
		data: updates,
	});

	return NextResponse.json({ ok: true, currentStep: stepNum });
}
