import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/trigger-audit
 *
 * Admin-only: triggers a full (cold) audit cycle for an organization.
 * Finds the production environment and creates a pending cycle.
 * The audit runner picks it up within 60s (heal cron interval).
 *
 * Body: { organizationId: string }
 */
export async function POST(request: Request) {
	const gate = await requireAdmin();
	if (gate.denied) return gate.denied;

	const { organizationId } = await request.json();
	if (!organizationId) {
		return NextResponse.json({ message: "organizationId required" }, { status: 400 });
	}

	const env = await prisma.environment.findFirst({
		where: { organizationId, isProduction: true },
		select: { id: true, domain: true },
	});

	if (!env) {
		return NextResponse.json({ message: "No production environment found" }, { status: 404 });
	}

	// Admin override semantics. The whole point of this endpoint is to
	// jump the scheduler's hot/warm cadence and force a fresh full
	// (cold pipeline + Stage D Playwright + no carry-forward). So:
	//
	//  1. Pending hot/warm cycles get marked failed with a clear reason
	//     — they were already going to run, but a full will give us
	//     strictly better evidence, so we cancel them rather than
	//     queueing behind them.
	//  2. A *running* cycle is left alone — interrupting mid-flight
	//     would leave partial evidence. The env lock guarantees the
	//     worker won't start our full until the current one finishes.
	//  3. If a full is already pending or running, return its id —
	//     no point enqueueing duplicates.
	const runningOrPendingFull = await prisma.auditCycle.findFirst({
		where: {
			environmentId: env.id,
			status: { in: ["pending", "running"] },
			cycleType: { in: ["full", "cold"] },
		},
		orderBy: { createdAt: "desc" },
		select: { id: true, status: true },
	});
	if (runningOrPendingFull) {
		return NextResponse.json({
			cycleId: runningOrPendingFull.id,
			environmentId: env.id,
			domain: env.domain,
			message: `Full audit already ${runningOrPendingFull.status}: ${runningOrPendingFull.id}`,
		});
	}

	// Cancel pending hot/warm so they don't run AFTER our full and
	// dilute the freshly-baselined evidence with shallow_plus carry-
	// forward rows the operator just intentionally bypassed.
	const cancelled = await prisma.auditCycle.updateMany({
		where: {
			environmentId: env.id,
			status: "pending",
			cycleType: { in: ["hot", "warm"] },
		},
		data: {
			status: "failed",
			lastError: "superseded by admin-triggered full audit",
			lastErrorAt: new Date(),
			completedAt: new Date(),
		},
	});
	if (cancelled.count > 0) {
		console.log(
			`[admin/trigger-audit] cancelled ${cancelled.count} pending hot/warm cycle(s) for env=${env.id} to clear lane for full audit`,
		);
	}

	const cycle = await prisma.auditCycle.create({
		data: {
			organizationId,
			environmentId: env.id,
			status: "pending",
			cycleType: "full",
		},
	});

	// Dispatch (Wave 5 Fase 1A): Redis queue → worker service. Falls back
	// to in-process when fallback is allowed (dev/demos), otherwise the
	// cycle row stays pending and the heal cron will retry once the worker
	// service comes back online.
	const { enqueueAuditCycle } = await import(
		"../../../../../apps/platform/audit-cycle-queue"
	);
	const enqueued = await enqueueAuditCycle({
		cycleId: cycle.id,
		environmentId: env.id,
		organizationId,
		priority: "hot",
	});
	if (!enqueued) {
		const { inProcessFallbackAllowed } = await import("@/libs/audit-dispatch");
		if (inProcessFallbackAllowed()) {
			import("../../../../../apps/audit-runner/run-cycle")
				.then((m) => m.runAuditCycle(cycle.id))
				.catch((err) => {
					console.error(`[admin/trigger-audit] dispatch failed for cycle ${cycle.id}:`, err);
				});
		} else {
			console.error(
				`[admin/trigger-audit] worker dispatch failed and in-process fallback disabled in production. cycle=${cycle.id}`,
			);
		}
	}

	// Surface whether the full will start immediately or queue behind a
	// running hot/warm (env lock will hold the worker until the current
	// cycle releases). The admin UI uses this to set expectations.
	const runningOther = await prisma.auditCycle.findFirst({
		where: {
			environmentId: env.id,
			status: "running",
			NOT: { id: cycle.id },
		},
		select: { id: true, cycleType: true },
	});

	return NextResponse.json({
		cycleId: cycle.id,
		environmentId: env.id,
		domain: env.domain,
		cancelledPending: cancelled.count,
		queuedBehind: runningOther
			? { id: runningOther.id, cycleType: runningOther.cycleType }
			: null,
		message: runningOther
			? `Full audit queued for ${env.domain} (will start when ${runningOther.cycleType} ${runningOther.id} finishes)`
			: `Full audit cycle started for ${env.domain}`,
	});
}
