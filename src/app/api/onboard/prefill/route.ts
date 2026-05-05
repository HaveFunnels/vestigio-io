import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// GET /api/onboard/prefill
//
// Returns existing BusinessProfile + Environment data for the
// current user's org — used to prefill the onboarding form when
// a user was promoted from a lead (promoteLeadToOrg already
// created the BusinessProfile with all lead form data).
//
// Returns null fields when no data exists.
// ──────────────────────────────────────────────

export async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});

	if (!membership) {
		return NextResponse.json({ prefill: null });
	}

	// Load BusinessProfile
	const profile = await prisma.businessProfile.findUnique({
		where: { organizationId: membership.organizationId },
		select: {
			businessModel: true,
			monthlyRevenue: true,
			averageOrderValue: true,
			conversionModel: true,
		},
	});

	// Load Environment (domain)
	const env = await prisma.environment.findFirst({
		where: { organizationId: membership.organizationId },
		orderBy: { createdAt: "asc" },
		select: { domain: true, activated: true },
	});

	// If nothing exists, no prefill
	if (!profile && !env) {
		return NextResponse.json({ prefill: null });
	}

	return NextResponse.json({
		prefill: {
			domain: env?.domain || null,
			activated: env?.activated || false,
			businessModel: profile?.businessModel || null,
			conversionModel: profile?.conversionModel || null,
			monthlyRevenue: profile?.monthlyRevenue || null,
			averageOrderValue: profile?.averageOrderValue || null,
		},
	});
}
