import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { issueFormToken } from "@/libs/lead-defense";

// ──────────────────────────────────────────────
// POST /api/lead/start
//
// Called when the visitor lands on /lp/audit. Creates an empty
// AnonymousLead row in `draft` status and returns:
//   - leadId  → used as the path/state key for the multi-step form
//   - formToken → HMAC token required by every subsequent step submit
//   - formStartedAt → timestamp the frontend echoes back at submit
//
// No PII is collected at this step. The visitor doesn't even need to
// touch the form before this fires (it runs on mount). The lead just
// gets garbage-collected by the daily cleanup cron if it never
// graduates past `draft`.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

const LEAD_TTL_DAYS = 14;

function getClientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0].trim();
	const realIp = request.headers.get("x-real-ip");
	if (realIp) return realIp;
	return "0.0.0.0";
}

export async function POST(request: Request) {
	const ip = getClientIp(request);
	const userAgent = request.headers.get("user-agent")?.slice(0, 1000) || null;

	// Per-IP rate limit: max 5 lead starts per IP per hour. Enforced
	// via a count query on AnonymousLead — no Redis dependency, just
	// reads the table. The table has an (ipAddress, createdAt) index.
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	const recentCount = await prisma.anonymousLead.count({
		where: {
			ipAddress: ip,
			createdAt: { gte: oneHourAgo },
		},
	});

	if (recentCount >= 5) {
		return NextResponse.json(
			{
				message:
					"You've started too many audits recently. Please wait a bit before trying again.",
			},
			{ status: 429 },
		);
	}

	const formStartedAt = new Date();
	const expiresAt = new Date(Date.now() + LEAD_TTL_DAYS * 24 * 60 * 60 * 1000);

	const lead = await prisma.anonymousLead.create({
		data: {
			status: "draft",
			currentStep: 1,
			ipAddress: ip,
			userAgent,
			formStartedAt,
			expiresAt,
		},
		select: { id: true, formStartedAt: true },
	});

	const formToken = issueFormToken(ip);

	return NextResponse.json({
		leadId: lead.id,
		formToken,
		formStartedAt: lead.formStartedAt?.toISOString(),
	});
}
