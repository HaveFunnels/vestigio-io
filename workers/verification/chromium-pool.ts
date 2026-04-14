/**
 * Chromium pool  (Wave 5 Fase 1A)
 *
 * For now this is a CONCURRENCY GUARDRAIL, not a true reuse pool. The
 * primary goal at Fase 1A is preventing OOM under burst — without a
 * global semaphore, a wave of 50 cycles each launching Chromium in
 * parallel would consume ~15GB of RAM (300MB × 50) and crash the
 * worker. The semaphore caps simultaneous launches to N (default 3),
 * so worst-case RAM stays under ~1GB.
 *
 * True browser-context reuse (skip the 1-3s cold-launch on every call,
 * cycle through a small set of warm browsers) is a Fase 3 concern when
 * Max-tier orgs run hot sweeps every 15min and the per-cycle launch
 * cost adds up. For Fase 1A the semaphore alone is the meaningful win.
 *
 * The semaphore is in-process: each worker (or each Next.js node) caps
 * its own launches independently. Cluster-wide limits are enforced by
 * the redis-job-queue's per-worker concurrency cap + the queue itself
 * limiting total in-flight cycles.
 *
 * Tunable via env: `CHROMIUM_POOL_SIZE` (default 3).
 */

const POOL_SIZE = Math.max(
	1,
	Number(process.env.CHROMIUM_POOL_SIZE || "3"),
);

let inUse = 0;
const waiters: Array<() => void> = [];

/**
 * Wait for an available slot. Resolves immediately if one is free,
 * otherwise queues until release() is called. Always pair with
 * releaseBrowserSlot() in a finally{} block.
 */
export async function acquireBrowserSlot(): Promise<void> {
	if (inUse < POOL_SIZE) {
		inUse += 1;
		return;
	}
	await new Promise<void>((resolve) => {
		waiters.push(() => {
			inUse += 1;
			resolve();
		});
	});
}

/**
 * Release a previously-acquired slot. Wakes the next waiter if any.
 * Idempotent against double-release (won't go negative).
 */
export function releaseBrowserSlot(): void {
	if (inUse > 0) inUse -= 1;
	const next = waiters.shift();
	if (next) next();
}

/**
 * For metrics endpoints (Fase 1B observability). Returns a snapshot of
 * pool utilization at the moment of the call.
 */
export function getPoolStats(): { inUse: number; capacity: number; waiters: number } {
	return { inUse, capacity: POOL_SIZE, waiters: waiters.length };
}
