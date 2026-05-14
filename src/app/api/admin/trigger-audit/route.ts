import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
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
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

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

	// Check for already running/pending cycle
	const existing = await prisma.auditCycle.findFirst({
		where: {
			environmentId: env.id,
			status: { in: ["pending", "running"] },
		},
	});

	if (existing) {
		return NextResponse.json({
			message: `Cycle already ${existing.status}: ${existing.id}`,
			cycleId: existing.id,
		}, { status: 409 });
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

	return NextResponse.json({
		cycleId: cycle.id,
		environmentId: env.id,
		domain: env.domain,
		message: `Full audit cycle started for ${env.domain}`,
	});
}
