import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// GET /api/onboarding/first-finding
//
// Powers the FirstFindingMoment that fires when a low-awareness
// user's first audit completes. Returns the single highest-impact
// negative finding so the welcome flow can lead with one concrete
// "you're losing R$X here" instead of a generic "47 findings, 12
// pages" celebration.
//
// `isFirstSession` distinguishes the moment-of-first-audit (where we
// want the full guided ritual) from a returning user happening to
// hit the same endpoint. Defined as: zero UserAction rows for this
// org/env with status in [in_progress, done, dismissed]. We allow
// `pending` because a pre-existing pending action shouldn't disqualify
// the user from the welcome flow — they haven't TOUCHED anything yet.
//
// Response shape:
//   { finding: { id, title, surface, severity, impactMin, impactMax,
//                impactMidpoint, rootCause, cause, effect, packLabel } | null,
//     totalLossMid: number,           // sum across all open neg findings
//     totalFindingCount: number,
//     currency: string,
//     isFirstSession: boolean }
// ──────────────────────────────────────────────

export const GET = withErrorTracking(async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 404 });
	}

	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;
	const environment = activeEnvId
		? await prisma.environment.findFirst({
				where: { id: activeEnvId, organizationId: membership.organizationId },
				select: { id: true },
			})
		: await prisma.environment.findFirst({
				where: { organizationId: membership.organizationId },
				orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
				select: { id: true },
			});
	if (!environment) {
		return NextResponse.json({ message: "No environment" }, { status: 404 });
	}

	const org = await prisma.organization.findUnique({
		where: { id: membership.organizationId },
		select: { currency: true },
	});

	// Top negative finding, picked by impactMidpoint DESC then severity.
	// Filter to active lifecycle states; we don't want to lead the
	// welcome with a stale or resolved finding.
	const topFinding = await prisma.finding.findFirst({
		where: {
			environmentId: environment.id,
			polarity: "negative",
			status: { in: ["created", "confirmed"] },
		},
		orderBy: [
			{ impactMidpoint: "desc" },
			{ severity: "asc" }, // critical sorts before high alphabetically
			{ createdAt: "desc" },
		],
		select: {
			id: true,
			surface: true,
			severity: true,
			pack: true,
			impactMin: true,
			impactMax: true,
			impactMidpoint: true,
			rootCause: true,
			projection: true,
		},
	});

	// Aggregate the total at-risk across all open negatives so the
	// FirstFindingMoment headline can frame "of the R$X you're losing,
	// this one is the biggest piece". Single SQL aggregation — cheap.
	const totalAgg = await prisma.finding.aggregate({
		where: {
			environmentId: environment.id,
			polarity: "negative",
			status: { in: ["created", "confirmed"] },
		},
		_sum: { impactMidpoint: true },
		_count: { _all: true },
	});

	// First-session = user hasn't touched any action yet. Pending rows
	// from cron promotion don't count as "touched".
	const touchedActions = await prisma.userAction.count({
		where: {
			organizationId: membership.organizationId,
			environmentId: environment.id,
			status: { in: ["in_progress", "done", "dismissed"] },
		},
	});

	// Decode title/cause/effect/basis_type fields from the persisted
	// FindingProjection JSON. Title isn't a top-level column on
	// Finding — it lives inside the projection blob.
	let title = "";
	let cause: string | null = null;
	let effect: string | null = null;
	let basisType: string | null = null;
	if (topFinding?.projection) {
		try {
			const proj = JSON.parse(topFinding.projection);
			title = typeof proj.title === "string" ? proj.title : "";
			cause = typeof proj.cause === "string" ? proj.cause : null;
			effect = typeof proj.effect === "string" ? proj.effect : null;
			basisType = typeof proj.basis_type === "string" ? proj.basis_type : null;
		} catch {}
	}

	return NextResponse.json({
		finding: topFinding
			? {
					id: topFinding.id,
					title,
					surface: topFinding.surface,
					severity: topFinding.severity,
					pack: topFinding.pack,
					impactMin: topFinding.impactMin,
					impactMax: topFinding.impactMax,
					impactMidpoint: topFinding.impactMidpoint,
					rootCause: topFinding.rootCause,
					cause,
					effect,
					basisType,
				}
			: null,
		totalLossMid: totalAgg._sum.impactMidpoint ?? 0,
		totalFindingCount: totalAgg._count?._all ?? 0,
		currency: org?.currency ?? "USD",
		isFirstSession: touchedActions === 0,
	});
}, { endpoint: "/api/onboarding/first-finding", method: "GET" });
