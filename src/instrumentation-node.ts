/**
 * Node-only instrumentation extension.
 *
 * This file is imported from `instrumentation.ts` ONLY when
 * `process.env.NEXT_RUNTIME === 'nodejs'`. The DefinePlugin substitutes
 * that literal at build time, so the entire dynamic import gets dead-code
 * eliminated from the Edge runtime bundle.
 *
 * Anything that transitively pulls in Node builtins (`http`, `https`,
 * `fs`, `child_process`, …) MUST live here, not in `instrumentation.ts`.
 *
 * Currently registers:
 *   - Audit-runner heal cron (60s) — recovers AuditCycles whose worker
 *     died (process restart, crash). Boots once on startup, then runs
 *     periodically. See apps/audit-runner/run-cycle.ts.
 *   - AnonymousLead cleanup cron (1h) — deletes /lp/audit lead drafts
 *     that have passed their expiresAt timestamp. Keeps the lead table
 *     bounded and respects the data retention promise on /lp/audit.
 */

const HEAL_INTERVAL_MS = 60_000;
const LEAD_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function registerNodeInstrumentation(): Promise<void> {
	const { healStuckCycles, redispatchOrphanedPending } = await import(
		"../apps/audit-runner/run-cycle"
	);
	const { healStuckProspectScans } = await import(
		"../apps/audit-runner/run-prospect-scan"
	);
	const { prisma } = await import("@/libs/prismaDb");

	// ── Audit-runner heal cron ──
	// Covers both customer audit cycles AND admin prospect scans (which
	// share the same staleness pattern: stuck >10min in 'running').
	const runHealPass = async () => {
		try {
			const healed = await healStuckCycles();
			const redispatched = await redispatchOrphanedPending();
			const prospectsHealed = await healStuckProspectScans();
			if (healed > 0 || redispatched > 0 || prospectsHealed > 0) {
				console.log(
					`[heal] cycles healed=${healed} redispatched=${redispatched} prospects=${prospectsHealed}`,
				);
			}
		} catch (err) {
			console.error("[heal] pass failed:", err);
		}
	};

	// Boot pass — non-blocking. Catches any orphans from a previous
	// process incarnation that died mid-crawl.
	runHealPass();

	// Recurring pass.
	setInterval(runHealPass, HEAL_INTERVAL_MS);

	console.log("✓ Audit-runner heal cron registered (60s interval)");

	// ── AnonymousLead cleanup cron ──
	const runLeadCleanup = async () => {
		try {
			const result = await prisma.anonymousLead.deleteMany({
				where: {
					expiresAt: { lt: new Date() },
					// Never delete converted leads — they're linked to a real
					// User+Org and we keep them for audit history.
					status: { not: "converted" },
				},
			});
			if (result.count > 0) {
				console.log(`[lead-cleanup] deleted ${result.count} expired leads`);
			}

			// Also expire stale MiniAuditResults — the cache TTL is enforced
			// at lookup time but we delete rows past the cap to keep the
			// table bounded. We retain a 7-day grace window past expiresAt
			// so an admin can still inspect a recently-expired result.
			const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
			const purged = await prisma.miniAuditResult.deleteMany({
				where: { expiresAt: { lt: sevenDaysAgo } },
			});
			if (purged.count > 0) {
				console.log(`[lead-cleanup] purged ${purged.count} stale mini-audits`);
			}
		} catch (err) {
			console.error("[lead-cleanup] pass failed:", err);
		}
	};

	// Boot pass — clears any leftovers from previous downtime
	runLeadCleanup();
	setInterval(runLeadCleanup, LEAD_CLEANUP_INTERVAL_MS);

	console.log("✓ Lead cleanup cron registered (1h interval)");
}
