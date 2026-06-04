import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// POST /api/onboarding/start-first-action
//
// The activation event for the low-awareness onboarding flow. Given
// a findingId from FirstFindingMoment, atomically:
//   1. Validates the finding belongs to the caller's org/env
//   2. Creates a UserAction with status = "in_progress"
//      (skipping the usual "pending" state — this IS the user
//      saying "I'm on it")
//   3. Snapshots the impact range for later attribution math
//   4. Returns the action id so the client can deep-link.
//
// Idempotency: if a UserAction already exists for this finding
// (regardless of status), we return that row's id instead of
// creating a duplicate.
//
// Body: { findingId: string }
// ──────────────────────────────────────────────

export const POST = withErrorTracking(async function POST(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const findingId = typeof body?.findingId === "string" ? body.findingId.trim() : "";
	if (!findingId) {
		return NextResponse.json({ message: "findingId required" }, { status: 400 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 404 });
	}

	const finding = await prisma.finding.findUnique({
		where: { id: findingId },
		select: {
			id: true,
			rootCause: true,
			impactMin: true,
			impactMax: true,
			impactMidpoint: true,
			cycleRef: true,
			environmentId: true,
			projection: true,
			environment: { select: { organizationId: true } },
		},
	});
	if (!finding || finding.environment.organizationId !== membership.organizationId) {
		return NextResponse.json({ message: "Finding not found" }, { status: 404 });
	}

	// Title lives inside the FindingProjection JSON blob, not as a
	// top-level column on the Finding model.
	let parsedTitle = "Untitled finding";
	try {
		const proj = JSON.parse(finding.projection);
		if (typeof proj.title === "string" && proj.title.trim()) {
			parsedTitle = proj.title.trim();
		}
	} catch {}

	const existing = await prisma.userAction.findFirst({
		where: { findingId: finding.id, environmentId: finding.environmentId },
		select: { id: true, status: true },
	});
	if (existing) {
		// Idempotency — if it's still "pending" we promote to in_progress
		// since the user just explicitly said they're on it.
		if (existing.status === "pending") {
			await prisma.userAction.update({
				where: { id: existing.id },
				data: { status: "in_progress" },
			});
		}
		return NextResponse.json({ id: existing.id, status: "in_progress", existed: true });
	}

	const title = parsedTitle.slice(0, 300);
	const description = finding.rootCause ? finding.rootCause.slice(0, 5000) : null;

	const action = await prisma.userAction.create({
		data: {
			organizationId: membership.organizationId,
			environmentId: finding.environmentId,
			findingId: finding.id,
			createdByUserId: user.id,
			title,
			description,
			estimatedEffortHours: null,
			status: "in_progress",
			baselineImpactMidpoint: finding.impactMidpoint,
			baselineImpactMin: finding.impactMin,
			baselineImpactMax: finding.impactMax,
			baselineCycleRef: finding.cycleRef,
		},
		select: { id: true, status: true, createdAt: true },
	});

	// Wave-22.6 onboarding — fire the activation celebration email
	// asynchronously. Trigger itself dedupes per-user so toggling a
	// second action won't re-send.
	(async () => {
		try {
			const org = await prisma.organization.findUnique({
				where: { id: membership.organizationId },
				select: { currency: true },
			});
			const { triggerActivationCelebratedEmail } = await import(
				"@/libs/notification-triggers"
			);
			await triggerActivationCelebratedEmail({
				userId: user.id,
				actionTitle: title,
				impactMidpoint: finding.impactMidpoint,
				currency: org?.currency ?? "USD",
			});
		} catch (err) {
			console.warn(
				"[onboarding/start-first-action] celebration email failed (non-fatal):",
				err,
			);
		}
	})();

	return NextResponse.json(
		{ id: action.id, status: action.status, existed: false },
		{ status: 201 },
	);
}, { endpoint: "/api/onboarding/start-first-action", method: "POST" });
