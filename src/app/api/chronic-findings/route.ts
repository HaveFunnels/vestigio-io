import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { detectChronicFindings } from "../../../../packages/value-caught";

// ──────────────────────────────────────────────
// GET /api/chronic-findings  (Wave 20.6)
//
// Returns identities that have toggled present → resolved → present at
// least N times across recent cycles. The data is the direct narrative
// for the always-on (Wave 21) pitch: "trust_boundary_crossed came back
// for the 3rd time in 5 weeks — this is what continuous monitoring
// catches that a one-shot audit doesn't."
//
// Query params:
//   envId        required — env to inspect
//   minResolves  default 2 — threshold for chronic classification
//   lookbackDays default 180 — how far back to count toggles
//
// Returns the rows sorted by resolveCount desc then by recent impact.
// ──────────────────────────────────────────────

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	const minResolves = Number(url.searchParams.get("minResolves") || "2");
	const lookbackDays = Number(url.searchParams.get("lookbackDays") || "180");

	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// Same auth pattern as /api/value-caught — owner-or-member of the org
	// that owns the env. Admins go through isAuthorized() but are NOT
	// granted automatic cross-tenant read (impersonation flow handles
	// that explicitly elsewhere).
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
		const chronic = await detectChronicFindings(prisma, envId, {
			minResolves: Math.max(2, Math.min(minResolves, 10)),
			lookbackDays: Math.max(7, Math.min(lookbackDays, 365)),
		});

		return NextResponse.json({
			environmentId: envId,
			min_resolves: minResolves,
			lookback_days: lookbackDays,
			count: chronic.length,
			chronic: chronic.map((c) => ({
				inference_key: c.inferenceKey,
				surface: c.surface,
				pack: c.pack,
				resolve_count: c.resolveCount,
				regressed_count: c.regressedCount,
				first_seen_at: c.firstSeenAt.toISOString(),
				last_seen_at: c.lastSeenAt.toISOString(),
				span_days: c.spanDays,
				current_status: c.currentStatus,
				recent_impact_midpoint: c.recentImpactMidpoint,
			})),
		});
	} catch (err) {
		console.error(`[chronic-findings] envId=${envId} failed:`, err);
		return NextResponse.json(
			{ message: "Failed to detect chronic findings" },
			{ status: 500 },
		);
	}
}
