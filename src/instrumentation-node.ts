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
 */

const HEAL_INTERVAL_MS = 60_000;

export async function registerNodeInstrumentation(): Promise<void> {
	const { healStuckCycles, redispatchOrphanedPending } = await import(
		"../apps/audit-runner/run-cycle"
	);

	const runHealPass = async () => {
		try {
			const healed = await healStuckCycles();
			const redispatched = await redispatchOrphanedPending();
			if (healed > 0 || redispatched > 0) {
				console.log(
					`[heal] cycles healed=${healed} redispatched=${redispatched}`,
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
}
