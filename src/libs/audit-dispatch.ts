/**
 * Audit dispatch policy.
 *
 * The audit-runner can be invoked two ways:
 *
 *   1. Enqueue to Redis  → drained by a separate `npm run start:worker`
 *      process. This is the only mode that scales: the web tier never
 *      touches CPU/event-loop/Prisma connections for the audit work.
 *
 *   2. In-process via `void import("audit-runner/run-cycle").then(...)`.
 *      Fast to wire up, but the cycle now competes with web requests
 *      for the same Node event loop + Prisma pool. At more than a
 *      handful of concurrent customers this degrades the entire web
 *      tier and surfaces as page hangs (most visibly: admin Impersonate
 *      during a first audit, when there is no projections cache to
 *      fast-path).
 *
 * Policy:
 *   - In production the in-process fallback is DISABLED by default.
 *     If Redis is unreachable, dispatch fails loudly so a broken
 *     worker deploy / missing REDIS_URL surfaces immediately instead
 *     of silently degrading every page load.
 *   - In any non-production env (development, test, demos) we still
 *     allow the in-process fallback so `npm run dev` keeps working
 *     without a Redis service.
 *   - Emergency escape hatch: set `ALLOW_IN_PROCESS_AUDIT_FALLBACK=1`
 *     to opt back into the legacy behaviour in production (e.g.
 *     during a transition before the worker service is up).
 */
export function inProcessFallbackAllowed(): boolean {
	if (process.env.NODE_ENV !== "production") return true;
	return process.env.ALLOW_IN_PROCESS_AUDIT_FALLBACK === "1";
}
