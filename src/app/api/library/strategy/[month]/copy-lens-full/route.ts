import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/library/strategy/[month]/copy-lens-full?envId=<id>
//
// Returns the FULL CopyFrameworkAudit detail (criteria-level verdicts,
// evidence, fix) for the cycle that the plan's copyLens section was
// computed from. The plan section itself only stores the per-page
// `topGap` to keep the snapshot small; the standalone page needs the
// rest of the data to render the actionable detail the customer asked
// for (each criterion's pass/warn/fail + the evidence + the suggested
// fix). Reads CopyFrameworkAudit directly so the response always
// reflects the latest audit row (no plan-snapshot staleness).
//
// Auth: owner-or-member of the env's org.
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
	await params; // month is unused — kept in the path for symmetry with the plan route
	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organization: {
				select: { id: true, ownerId: true, locale: true, memberships: { select: { userId: true } } },
			},
		},
	});
	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}
	const userId = (user as any).id as string;
	const isOwner = env.organization?.ownerId === userId;
	const isMember = env.organization?.memberships.some((m) => m.userId === userId);
	const isSiteAdmin = (user as any).role === "ADMIN";
	if (!isOwner && !isMember && !isSiteAdmin) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const locale = env.organization?.locale ?? "pt-BR";

	// Latest cycle that produced any CopyFrameworkAudit for this env+locale.
	// Matches the plan section's resolution logic so the standalone page
	// stays aligned with what's shown in the plan summary.
	const latest = await prisma.copyFrameworkAudit.findFirst({
		where: { environmentId: envId, locale },
		orderBy: { createdAt: "desc" },
		select: { cycleId: true },
	});
	if (!latest) {
		return NextResponse.json({ audits: [], cycleId: null });
	}

	const rows = await prisma.copyFrameworkAudit.findMany({
		where: {
			environmentId: envId,
			cycleId: latest.cycleId,
			locale,
		},
		select: {
			frameworkId: true,
			pageUrl: true,
			pageSlot: true,
			scorePct: true,
			criteria: true,
		},
	});

	return NextResponse.json({
		cycleId: latest.cycleId,
		locale,
		audits: rows.map((r) => ({
			frameworkId: r.frameworkId,
			pageUrl: r.pageUrl,
			pageSlot: r.pageSlot,
			scorePct: r.scorePct,
			criteria: Array.isArray(r.criteria) ? r.criteria : [],
		})),
	});
}
