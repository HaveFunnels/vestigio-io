import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// POST /api/cycles/trigger
//
// User-initiated audit cycle. Primary use case is the "Run
// verification now" button on a UserAction that's been marked
// done — pays credits in exchange for immediate confirmation
// instead of waiting for the next scheduled cycle.
//
// Credit gate: verification cycles cost VERIFICATION_CYCLE_COST
// credits per run (see apps/platform/credits.ts for the plan-
// bucketed accounting). The vestigio (free) plan is rejected —
// that tier has no credit allocation.
//
// Double-enqueue guard: if the env already has a pending OR
// running cycle, we refuse rather than race the existing one.
// Credits are NOT charged on this refusal path — the user's
// first click already bought the work.
//
// Body (all optional):
//   {
//     environment_id?: string  // default: active_env cookie
//     cycle_type?: 'verification' | 'full'  // default: verification
//     reason?: string  // free-form, logged for telemetry
//   }
// ──────────────────────────────────────────────

const VERIFICATION_CYCLE_COST = 5;
const FULL_CYCLE_COST = 20;

type ErrorCode =
	| "unauthorized"
	| "forbidden"
	| "no_environment"
	| "insufficient_credits"
	| "cycle_already_running"
	| "dispatch_failed"
	| "invalid_body";

function errorResponse(
	code: ErrorCode,
	message: string,
	status: number,
	extra?: Record<string, unknown>,
): NextResponse {
	return NextResponse.json(
		{ error: code, message, ...(extra || {}) },
		{ status },
	);
}

export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!session?.user || !userId) {
		return errorResponse("unauthorized", "Unauthorized", 401);
	}

	let body: {
		environment_id?: string;
		cycle_type?: string;
		reason?: string;
	};
	try {
		body = await request.json().catch(() => ({}));
	} catch {
		return errorResponse("invalid_body", "Invalid JSON body", 400);
	}

	const cycleType =
		body.cycle_type === "full" ? "full" : "verification";
	const cost =
		cycleType === "full" ? FULL_CYCLE_COST : VERIFICATION_CYCLE_COST;

	// Resolve environment — explicit param wins, else fall back to the
	// active_env cookie (same pattern as /api/cycles/latest).
	let environmentId = typeof body.environment_id === "string"
		? body.environment_id.trim()
		: "";
	if (!environmentId) {
		const cookieStore = await import("next/headers").then((m) => m.cookies());
		environmentId = cookieStore.get("active_env")?.value || "";
	}
	if (!environmentId) {
		return errorResponse(
			"no_environment",
			"No active environment — open the app first so we know which site to audit.",
			400,
		);
	}

	const env = await prisma.environment.findUnique({
		where: { id: environmentId },
		select: {
			id: true,
			organizationId: true,
			organization: { select: { id: true, plan: true } },
		},
	});
	if (!env) {
		return errorResponse("no_environment", "Environment not found.", 404);
	}

	// Verify caller is a member of the env's org.
	const membership = await prisma.membership.findFirst({
		where: { userId, organizationId: env.organizationId },
		select: { id: true },
	});
	if (!membership) {
		return errorResponse("forbidden", "Forbidden", 403);
	}

	// Double-enqueue guard — one active cycle per env at a time.
	const existing = await prisma.auditCycle.findFirst({
		where: {
			environmentId: env.id,
			status: { in: ["pending", "running"] },
		},
		orderBy: { createdAt: "desc" },
		select: { id: true, status: true, createdAt: true },
	});
	if (existing) {
		return errorResponse(
			"cycle_already_running",
			existing.status === "running"
				? "An audit is already running for this site — hang tight, attribution updates automatically when it finishes."
				: "An audit is already queued for this site. Please wait for it to complete before starting another.",
			409,
			{
				cycle_id: existing.id,
				cycle_status: existing.status,
				created_at: existing.createdAt.toISOString(),
			},
		);
	}

	// Credit gate.
	const { canAffordVerification, consumeCredits } = await import(
		"../../../../../apps/platform/credits"
	);
	const plan = (env.organization.plan || "vestigio") as
		| "vestigio"
		| "pro"
		| "max";
	const check = await canAffordVerification(env.organizationId, plan, cost);
	if (!check.allowed) {
		return errorResponse(
			"insufficient_credits",
			check.message || "Insufficient credits.",
			402,
			{
				shortfall: check.shortfall,
				balance: check.balance,
				cost,
			},
		);
	}

	// Create the cycle row, enqueue, then charge. We charge LAST so that
	// a dispatch failure (Redis down + in-process import also failed)
	// doesn't bill the user for a cycle that never ran. The window
	// between row creation and charge is small; if we crash mid-flight
	// the cycle row is orphaned (pending forever) but no credit was
	// burned — better than the reverse.
	const cycle = await prisma.auditCycle.create({
		data: {
			organizationId: env.organizationId,
			environmentId: env.id,
			status: "pending",
			cycleType,
		},
		select: { id: true },
	});

	let dispatched = false;
	try {
		const { enqueueAuditCycle } = await import(
			"../../../../../apps/platform/audit-cycle-queue"
		);
		// User-initiated runs go to the "hot" tier so the worker picks
		// them up ahead of scheduled sweeps. This is the impatience
		// premium the credits pay for.
		const enqueued = await enqueueAuditCycle({
			cycleId: cycle.id,
			environmentId: env.id,
			organizationId: env.organizationId,
			priority: "hot",
		});
		if (enqueued) {
			dispatched = true;
		} else {
			// Redis unavailable — fall back to in-process dispatch so demos
			// and local dev aren't blocked. Same pattern as the activation
			// endpoint.
			void import("../../../../../apps/audit-runner/run-cycle")
				.then((m) => m.runAuditCycle(cycle.id))
				.catch((err) => {
					console.error(
						`[api/cycles/trigger] in-process dispatch failed cycle=${cycle.id}:`,
						err,
					);
				});
			dispatched = true;
		}
	} catch (err) {
		console.error(
			`[api/cycles/trigger] dispatch failed cycle=${cycle.id}:`,
			err,
		);
	}

	if (!dispatched) {
		// Clean up — mark the orphan row as failed so the scheduler
		// doesn't pick it up later. Credit was not yet consumed.
		await prisma.auditCycle
			.update({
				where: { id: cycle.id },
				data: { status: "failed" },
			})
			.catch(() => {});
		return errorResponse(
			"dispatch_failed",
			"Couldn't queue the cycle. Please try again in a moment.",
			503,
		);
	}

	// Charge credits AFTER successful dispatch.
	try {
		await consumeCredits(env.organizationId, cost, plan);
	} catch (err) {
		console.warn(
			`[api/cycles/trigger] credit charge failed cycle=${cycle.id}:`,
			err,
		);
		// Not fatal — the cycle is already queued. Credit accounting
		// will reconcile on next query.
	}

	const postCharge = await (async () => {
		try {
			const { getCreditBalance } = await import(
				"../../../../../apps/platform/credits"
			);
			return await getCreditBalance(env.organizationId, plan);
		} catch {
			return null;
		}
	})();

	return NextResponse.json({
		cycle_id: cycle.id,
		status: "queued",
		priority: "hot",
		cycle_type: cycleType,
		credits_charged: cost,
		credits_remaining: postCharge?.available ?? null,
		// A conservative estimate; verification cycles typically finish
		// in 60-180s but we surface a generous ceiling so the UI can
		// set a "this is taking longer than expected" timer.
		estimated_seconds: cycleType === "verification" ? 180 : 300,
	});
}
