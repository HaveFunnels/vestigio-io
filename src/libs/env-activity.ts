import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Environment activity tracking  (Wave 5 Fase 2)
//
// Two responsibilities, kept together because they share the same row:
//
//   1. touchEnvActivity(envId) — bump Environment.lastAccessedAt when
//      an owner/member loads a console page. Debounced to 1h in DB
//      (only writes if the stored timestamp is older than 1h) so we
//      don't hammer the row on every navigation. Called from the
//      server component layout at src/app/app/layout.tsx.
//
//   2. resumeIfPaused(envId, cycleFactory) — if the env was auto-paused
//      by the inactivity cron, flip continuousPaused back to false and
//      dispatch a fresh AuditCycle as a catch-up. Called inline with
//      the touch so returning to the app after 15 days kicks off an
//      immediate audit against whatever's changed.
//
// Both functions are best-effort: if prisma throws (DB unreachable,
// migration pending), they swallow and return so the layout keeps
// rendering. The inactivity cron and the user's next access will
// correct any drift on the next cycle.
// ──────────────────────────────────────────────

const TOUCH_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Debounced write of `lastAccessedAt`. If the row's stored timestamp is
 * already within the debounce window we skip the UPDATE entirely to avoid
 * needless write load from page navigations.
 *
 * Returns `true` if a write happened (rare), `false` otherwise. Callers
 * don't typically need the result — it's exposed for tests.
 */
export async function touchEnvActivity(envId: string): Promise<boolean> {
	if (!envId) return false;
	try {
		const current = await prisma.environment.findUnique({
			where: { id: envId },
			select: { lastAccessedAt: true },
		});
		if (!current) return false;

		const now = Date.now();
		const last = current.lastAccessedAt?.getTime() ?? 0;
		if (now - last < TOUCH_DEBOUNCE_MS) return false;

		await prisma.environment.update({
			where: { id: envId },
			data: { lastAccessedAt: new Date(now) },
		});
		return true;
	} catch (err) {
		console.warn("[env-activity.touch] failed:", err);
		return false;
	}
}

/**
 * If the env was paused by the inactivity cron, clear the flag and
 * dispatch a fresh cycle. The cycle is fire-and-forget — we don't await
 * the audit-runner so the page can finish rendering.
 *
 * Returns `true` if a catch-up cycle was dispatched. Used by the layout
 * to optionally surface a toast/banner ("Resuming audits…") after a
 * long absence.
 */
export async function resumeIfPaused(envId: string): Promise<boolean> {
	if (!envId) return false;
	try {
		const env = await prisma.environment.findUnique({
			where: { id: envId },
			select: {
				id: true,
				organizationId: true,
				continuousPaused: true,
				activated: true,
			},
		});
		if (!env || !env.continuousPaused || !env.activated) return false;

		// Clear the pause flag first so a concurrent request doesn't try to
		// dispatch a second cycle. The write is tiny and idempotent.
		await prisma.environment.update({
			where: { id: envId },
			data: { continuousPaused: false },
		});

		const cycle = await prisma.auditCycle.create({
			data: {
				organizationId: env.organizationId,
				environmentId: env.id,
				status: "pending",
				cycleType: "full",
			},
		});

		// Dispatch (Wave 5 Fase 1A): Redis queue → worker service, with
		// in-process fallback for Redis-less deploys. Catch-up runs as
		// "cold" priority since this is a post-inactivity baseline.
		const { enqueueAuditCycle } = await import(
			"../../apps/platform/audit-cycle-queue"
		);
		const enqueued = await enqueueAuditCycle({
			cycleId: cycle.id,
			environmentId: env.id,
			organizationId: env.organizationId,
			priority: "cold",
		});
		if (!enqueued) {
			import("../../apps/audit-runner/run-cycle")
				.then((m) => m.runAuditCycle(cycle.id))
				.catch((err) => {
					console.error(
						`[env-activity.resume] audit dispatch failed for cycle ${cycle.id}:`,
						err,
					);
				});
		}

		return true;
	} catch (err) {
		console.warn("[env-activity.resume] failed:", err);
		return false;
	}
}
