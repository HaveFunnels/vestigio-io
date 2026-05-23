import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import {
	computeValueCaughtForCurrentMonth,
	computeValueCaughtForPriorMonth,
} from "../../../../packages/value-caught";

// ──────────────────────────────────────────────
// GET /api/value-caught  (Wave 21.5)
//
// Returns the value-caught summary for an environment. Two modes:
//   ?envId=<id>&window=current  → month-so-far (in-flight tally)
//   ?envId=<id>&window=prior    → completed prior month (sticky number)
//
// Default window is `current` so the dashboard widget shows the
// in-flight tally without needing to call this twice.
//
// The numbers come straight from packages/value-caught — the engine
// is the source of truth; this route is just an auth + query wrapper.
// ──────────────────────────────────────────────

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	const window = url.searchParams.get("window") || "current";

	if (!envId) {
		return NextResponse.json(
			{ message: "envId is required" },
			{ status: 400 },
		);
	}

	// Authorization: confirm the requested env belongs to a user's org.
	// The cheap path is: load env → org → org owner === user id OR the
	// user has a membership row for the org. We use the same pattern
	// used elsewhere in this codebase (cycles/latest follows the same
	// shape via isAuthorized membership check).
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organization: {
				select: {
					id: true,
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});

	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}

	const isOwner = env.organization?.ownerId === user.id;
	const isMember = env.organization?.memberships?.some((m) => m.userId === user.id) ?? false;
	if (!isOwner && !isMember) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	try {
		const summary = window === "prior"
			? await computeValueCaughtForPriorMonth(prisma, envId)
			: await computeValueCaughtForCurrentMonth(prisma, envId);

		return NextResponse.json({
			environmentId: summary.environmentId,
			window: {
				start: summary.windowStart.toISOString(),
				end: summary.windowEnd.toISOString(),
				type: window,
			},
			resolved_count: summary.resolvedCount,
			total_caught: {
				min: summary.totalCaughtMin,
				max: summary.totalCaughtMax,
				midpoint: summary.totalCaughtMidpoint,
			},
			top_resolved: summary.topResolved.map((t) => ({
				inference_key: t.inferenceKey,
				surface: t.surface,
				pack: t.pack,
				impact_midpoint: t.impactMidpoint,
				resolved_at: t.resolvedAt.toISOString(),
			})),
		});
	} catch (err) {
		console.error(`[value-caught] envId=${envId} window=${window} failed:`, err);
		return NextResponse.json(
			{ message: "Failed to compute value caught" },
			{ status: 500 },
		);
	}
}
