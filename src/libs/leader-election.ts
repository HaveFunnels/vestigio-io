import { getRedis } from "./redis";

// ──────────────────────────────────────────────
// Leader election  (Wave 5 Fase 1A)
//
// Cooperative election based on `SET key value NX EX ttl`. Wraps any
// per-tick work that should run on exactly one replica when the web/
// worker service scales horizontally on Railway.
//
// Without leader election, every replica's setInterval fires the heal
// cron, the inactivity-pause cron, and (Fase 3) the scheduler — leading
// to N-fold work, race conditions, and potentially N-fold notifications.
//
// Pattern:
//   const ok = await tryAcquireLeadership("heal", { ttlSec: 90 });
//   if (!ok) return;
//   // ... do work ...
//
// The TTL should be longer than the longest expected work-iteration so
// the lock doesn't expire mid-tick. For typical 60s heal/inactivity
// passes, ttlSec=90 is plenty.
//
// Trade-off: this implementation does NOT verify holder ownership on
// renew/release (would require Lua). The risk: replica A's TTL expires,
// replica B acquires, then replica A's late renew clobbers it. Mitigated
// by (a) keeping ttlSec >> tick duration, and (b) treating all the
// leader-gated work as idempotent (heal, inactivity-pause, scheduler).
// If we ever need stronger guarantees, switch to a fencing token + Lua.
//
// When Redis isn't configured, the helpers degrade to "always leader"
// — single-process deploys don't need election, and degrading is
// safer than failing closed (would silently disable all crons).
// ──────────────────────────────────────────────

const PREFIX = "vestigio:leader";

function leaderKey(name: string): string {
	return `${PREFIX}:${name}`;
}

// Stable per-process holder ID for log correlation. Not used for
// CAS today (see trade-off above).
const HOLDER_ID = `${process.pid}_${Math.random().toString(16).slice(2, 8)}`;

export interface AcquireOptions {
	ttlSec: number;
}

/**
 * Try to become the leader for `name`. Returns true if the caller now
 * holds the lock and may proceed with the per-tick work; false if
 * another replica already holds it (caller should skip this tick).
 *
 * Always returns true when Redis is unavailable so single-process
 * deploys keep running their crons.
 */
export async function tryAcquireLeadership(
	name: string,
	opts: AcquireOptions,
): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return true;
	try {
		const result = await redis.set(
			leaderKey(name),
			HOLDER_ID,
			"EX",
			opts.ttlSec,
			"NX",
		);
		return result === "OK";
	} catch (err) {
		console.warn(`[leader-election] acquire failed name=${name}:`, err);
		// Failing closed (returning false) would silently kill all crons
		// across the cluster on a Redis blip. Failing open is safer for
		// idempotent work like heal scans.
		return true;
	}
}

/**
 * Refresh the lock TTL while holding it. Use during long-running ticks
 * to avoid losing leadership mid-work. Best-effort — see the file
 * header for the trade-off discussion.
 */
export async function renewLeadership(
	name: string,
	opts: AcquireOptions,
): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return true;
	try {
		// EXPIRE returns 1 on success, 0 if the key doesn't exist. If the
		// key was evicted (or another replica took it after a clobbering
		// SET), this returns 0 and the caller knows to back off.
		const v = await redis.expire(leaderKey(name), opts.ttlSec);
		return v === 1;
	} catch (err) {
		console.warn(`[leader-election] renew failed name=${name}:`, err);
		return false;
	}
}

/**
 * Voluntarily release leadership. Idempotent. Use in graceful-shutdown
 * handlers so the lock doesn't sit unowned until TTL.
 */
export async function releaseLeadership(name: string): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	try {
		await redis.del(leaderKey(name));
	} catch {
		// noop — TTL will expire it eventually
	}
}

/**
 * Convenience wrapper: run `fn` only if we hold the lock for `name`.
 * No-ops silently when another replica is the leader. Returns true if
 * the work ran, false if it was skipped.
 *
 * Does not release on completion — letting the TTL expire is desirable
 * because it keeps leadership sticky on one replica between ticks
 * (avoids bouncing leadership every cron interval).
 */
export async function withLeadership<T>(
	name: string,
	opts: AcquireOptions,
	fn: () => Promise<T>,
): Promise<{ ran: boolean; result?: T }> {
	const ok = await tryAcquireLeadership(name, opts);
	if (!ok) return { ran: false };
	const result = await fn();
	return { ran: true, result };
}

export { HOLDER_ID };
