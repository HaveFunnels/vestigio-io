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
	// version=3 — Wave-22.6 mini-audit redesign with JTBD trio.
	//   Step 1: domain + ownershipConfirmed
	//   Step 2: businessModel
	//   Step 3: monthlyRevenue
	//   Step 4: primaryConcern
	//   Step 5: currentOptimizationMethod
	//   Step 6: whyNow
	//   Step 7: email (terminal — triggers mini-audit)
	// version=2 — premium 4-step (domain/business/revenue/email).
	// Default (v1) preserves the original mapping for in-progress leads.
	version?: number;
	// Step-specific fields (all optional — server picks the right ones
	// per step number)
	organizationName?: string;
	businessModel?: string;
	domain?: string;
	ownershipConfirmed?: boolean;
	monthlyRevenue?: string; // raw "$50k" — parsed server-side
	averageTicket?: string;
	conversionModel?: string;
	primaryConcern?: string;
	currentOptimizationMethod?: string;
	whyNow?: string;
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

	if (isNaN(stepNum) || stepNum < 1 || stepNum > 7) {
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

	const isV2 = body.version === 2;
	const isV3 = body.version === 3;

	if (isV3) {
		// ── V3 step mapping — Wave-22.6 mini-audit JTBD form ──
		// Step 1: domain + ownership
		// Step 2: businessModel (conversionModel inferred client-side)
		// Step 3: monthlyRevenue
		// Step 4: primaryConcern
		// Step 5: currentOptimizationMethod
		// Step 6: whyNow
		// Step 7: email (terminal)
		const VALID_BUSINESS_MODELS = new Set(["ecommerce", "lead_gen", "saas", "hybrid"]);
		const VALID_CONCERN = new Set([
			"traffic_no_sales",
			"low_conversion",
			"unknown_leak",
			"scale_efficiency",
			"prioritization",
		]);
		const VALID_METHOD = new Set([
			"analytics_tools",
			"session_replay",
			"agency_consultant",
			"team_judgment",
			"spreadsheets",
			"nothing",
		]);
		const VALID_WHY_NOW = new Set([
			"scaling_paid_traffic",
			"recent_drop",
			"prove_roi",
			"competitive_pressure",
			"chronic_pain",
			"exploring",
		]);

		if (stepNum === 1) {
			const domainCheck = validateLeadDomain(body.domain || "");
			if (!domainCheck.ok) {
				return NextResponse.json(
					{ message: domainCheck.reason, field: "domain" },
					{ status: 422 },
				);
			}
			if (!body.ownershipConfirmed) {
				return NextResponse.json(
					{ message: "Please confirm ownership before we analyze your domain.", field: "ownershipConfirmed" },
					{ status: 422 },
				);
			}
			updates.domain = body.domain!.trim();
			const domainClean = body.domain!.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
			const orgFromDomain = domainClean.split(".")[0];
			updates.organizationName = orgFromDomain.charAt(0).toUpperCase() + orgFromDomain.slice(1);
		}

		if (stepNum === 2) {
			if (!body.businessModel || !VALID_BUSINESS_MODELS.has(body.businessModel)) {
				return NextResponse.json(
					{ message: "Please pick a valid business type.", field: "businessModel" },
					{ status: 422 },
				);
			}
			updates.businessModel = body.businessModel;
			// conversionModel inferred client-side — accept if present.
			if (body.conversionModel) {
				const VALID_CONVERSION_MODELS = new Set(["checkout", "whatsapp", "form", "external"]);
				if (VALID_CONVERSION_MODELS.has(body.conversionModel)) {
					updates.conversionModel = body.conversionModel;
				}
			}
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
		}

		if (stepNum === 4) {
			if (!body.primaryConcern || !VALID_CONCERN.has(body.primaryConcern)) {
				return NextResponse.json(
					{ message: "Please pick what concerns you most.", field: "primaryConcern" },
					{ status: 422 },
				);
			}
			updates.primaryConcern = body.primaryConcern;
		}

		if (stepNum === 5) {
			if (!body.currentOptimizationMethod || !VALID_METHOD.has(body.currentOptimizationMethod)) {
				return NextResponse.json(
					{ message: "Please pick how you optimize today.", field: "currentOptimizationMethod" },
					{ status: 422 },
				);
			}
			updates.currentOptimizationMethod = body.currentOptimizationMethod;
		}

		if (stepNum === 6) {
			if (!body.whyNow || !VALID_WHY_NOW.has(body.whyNow)) {
				return NextResponse.json(
					{ message: "Please pick why now.", field: "whyNow" },
					{ status: 422 },
				);
			}
			updates.whyNow = body.whyNow;
		}

		if (stepNum === 7) {
			const emailCheck = validateLeadEmail(body.email || "");
			if (!emailCheck.ok) {
				return NextResponse.json(
					{ message: emailCheck.reason, field: "email" },
					{ status: 422 },
				);
			}
			updates.email = body.email!.trim().toLowerCase();
		}
	} else if (isV2) {
		// ── V2 step mapping (premium one-question-per-screen form) ──
		// Step 1: domain + ownership
		// Step 2: businessModel + conversionModel
		// Step 3: monthlyRevenue
		// Step 4: email

		if (stepNum === 1) {
			const domainCheck = validateLeadDomain(body.domain || "");
			if (!domainCheck.ok) {
				return NextResponse.json(
					{ message: domainCheck.reason, field: "domain" },
					{ status: 422 },
				);
			}
			if (!body.ownershipConfirmed) {
				return NextResponse.json(
					{ message: "Please confirm ownership before we audit your domain.", field: "ownershipConfirmed" },
					{ status: 422 },
				);
			}
			updates.domain = body.domain!.trim();
			// Derive org name from domain (e.g. "example.com" → "Example")
			const domainClean = body.domain!.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
			const orgFromDomain = domainClean.split(".")[0];
			updates.organizationName = orgFromDomain.charAt(0).toUpperCase() + orgFromDomain.slice(1);
		}

		if (stepNum === 2) {
			// BUG-02 fix: Validate against allowed enum values
			const VALID_BUSINESS_MODELS = new Set(["ecommerce", "lead_gen", "saas", "hybrid"]);
			const VALID_CONVERSION_MODELS = new Set(["checkout", "whatsapp", "form", "external"]);
			if (!body.businessModel || !VALID_BUSINESS_MODELS.has(body.businessModel)) {
				return NextResponse.json(
					{ message: "Please pick a valid business type.", field: "businessModel" },
					{ status: 422 },
				);
			}
			if (!body.conversionModel || !VALID_CONVERSION_MODELS.has(body.conversionModel)) {
				return NextResponse.json(
					{ message: "Please pick a valid conversion model.", field: "conversionModel" },
					{ status: 422 },
				);
			}
			updates.businessModel = body.businessModel;
			updates.conversionModel = body.conversionModel;
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
			// BUG-01 fix: also persist averageTicket (was missing in V2)
			if (body.averageTicket != null) {
				const ticketNum = typeof body.averageTicket === "number"
					? body.averageTicket
					: parseFloat(String(body.averageTicket));
				if (!isNaN(ticketNum) && ticketNum > 0) {
					updates.averageTicket = ticketNum;
				}
			}
		}

		if (stepNum === 4) {
			const emailCheck = validateLeadEmail(body.email || "");
			if (!emailCheck.ok) {
				return NextResponse.json(
					{ message: emailCheck.reason, field: "email" },
					{ status: 422 },
				);
			}
			updates.email = body.email!.trim().toLowerCase();
		}
	} else {
		// ── V1 step mapping (original 4-step form) ──

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
			updates.averageTicket = ticketParsed;
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
	}

	await prisma.anonymousLead.update({
		where: { id },
		data: updates,
	});

	return NextResponse.json({ ok: true, currentStep: stepNum });
}
