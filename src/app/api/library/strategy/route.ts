import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/library/strategy?envId=<id>
//
// Lists MonthlyStrategyPlan summaries for an env, most recent first.
// Auth: owner-or-member of the env's org. Returns lightweight
// summaries (heroMetrics + status) — the full plan content lives
// under /api/library/strategy/[month].
//
// Used by /app/library to render the Plans gallery cards.
// ──────────────────────────────────────────────

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// Verify access — same pattern as /api/surfaces.
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	const isOwner = env.organization?.ownerId === user.id;
	const isMember = env.organization?.memberships?.some((m) => m.userId === user.id) ?? false;
	if (!isOwner && !isMember) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const plans = await prisma.monthlyStrategyPlan.findMany({
		where: {
			environmentId: envId,
			status: { not: "archived" },
		},
		orderBy: { month: "desc" },
		select: {
			id: true,
			month: true,
			status: true,
			generatedAt: true,
			heroMetricsJson: true,
		},
		take: 24, // 2 years cap
	});

	return NextResponse.json({
		plans: plans.map((p) => {
			const hero = (p.heroMetricsJson ?? {}) as Record<string, number>;
			return {
				id: p.id,
				month: p.month,
				status: p.status,
				generatedAt: p.generatedAt.toISOString(),
				heroMetrics: {
					retainedMid: Number(hero.retainedMid ?? 0),
					capturedMid: Number(hero.capturedMid ?? 0),
					criticalCount: Number(hero.criticalCount ?? 0),
					inProgressCount: Number(hero.inProgressCount ?? 0),
				},
			};
		}),
	});
}
