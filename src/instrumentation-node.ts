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
 *   - Behavioral rate-limit prune (5m) — Wave 0.2 in-memory rate
 *     buckets for /api/behavioral/ingest. Just stops the Map from
 *     growing forever; doesn't touch DB.
 */

const HEAL_INTERVAL_MS = 60_000;
const LEAD_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RATE_PRUNE_INTERVAL_MS = 5 * 60 * 1000; // 5 min
// Wave 5 Fase 2 — check once an hour whether any env has gone 14 days
// without access and should be paused. Hourly cadence is fine because
// the threshold is measured in days; a pause that lands up to 60min
// late is invisible to the user.
const INACTIVITY_PAUSE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INACTIVITY_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function registerNodeInstrumentation(): Promise<void> {
	const { healStuckCycles, redispatchOrphanedPending } = await import(
		"../apps/audit-runner/run-cycle"
	);
	const { healStuckProspectScans } = await import(
		"../apps/audit-runner/run-prospect-scan"
	);
	const { prisma } = await import("@/libs/prismaDb");
	// Wave 5 Fase 1A — every cron below is gated by a Redis-backed leader
	// lock so multi-replica Railway deploys don't N-fold the work. When
	// Redis isn't configured, the helper returns true unconditionally
	// (single-process behavior is preserved).
	const { withLeadership } = await import("@/libs/leader-election");

	// ── Audit-runner heal cron ──
	// Covers both customer audit cycles AND admin prospect scans (which
	// share the same staleness pattern: stuck >10min in 'running').
	const runHealPass = async () => {
		await withLeadership("heal", { ttlSec: 90 }, async () => {
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
		});
	};

	// Boot pass — non-blocking. Catches any orphans from a previous
	// process incarnation that died mid-crawl.
	runHealPass();

	// Recurring pass.
	setInterval(runHealPass, HEAL_INTERVAL_MS);

	console.log("✓ Audit-runner heal cron registered (60s interval)");

	// ── AnonymousLead + behavioral pixel cleanup cron ──
	const runLeadCleanup = async () => {
		await withLeadership("lead-cleanup", { ttlSec: 90 }, async () => {
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

			// Wave 0.3: prune behavioral pixel events older than the
			// 30-day aggregation window. The processor re-aggregates the
			// last 30 days every cycle, so older events are dead weight.
			// Indexed by receivedAt for fast deleteMany.
			const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			const prunedEvents = await prisma.rawBehavioralEvent.deleteMany({
				where: { receivedAt: { lt: thirtyDaysAgo } },
			});
			if (prunedEvents.count > 0) {
				console.log(`[lead-cleanup] pruned ${prunedEvents.count} stale behavioral events`);
			}
		} catch (err) {
			console.error("[lead-cleanup] pass failed:", err);
		}
		});
	};

	// Boot pass — clears any leftovers from previous downtime
	runLeadCleanup();
	setInterval(runLeadCleanup, LEAD_CLEANUP_INTERVAL_MS);

	console.log("✓ Lead cleanup cron registered (1h interval)");

	// ── Behavioral ingest rate-limit prune (Wave 0.2) ──
	const { pruneRateBuckets } = await import("@/libs/behavioral-ingest");
	setInterval(() => {
		try {
			pruneRateBuckets();
		} catch (err) {
			console.error("[behavioral-ingest] rate prune failed:", err);
		}
	}, RATE_PRUNE_INTERVAL_MS);

	console.log("✓ Behavioral rate-limit prune cron registered (5m interval)");

	// ── Inactivity pause cron (Wave 5 Fase 2) ──
	// Auto-pauses continuous audits for envs the customer hasn't opened in
	// 14 days. A NotificationLog row is inserted so the owner gets an email
	// explaining the pause. When they come back, the layout's resume hook
	// clears the flag and dispatches a catch-up cycle.
	//
	// Demo orgs are exempt — they must stay live so sales surfaces don't
	// fall back to empty state.
	const runInactivityPause = async () => {
		await withLeadership("inactivity-pause", { ttlSec: 90 }, async () => {
		try {
			const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS);
			// Find candidate envs (activated, not already paused, idle past
			// the threshold, and not belonging to a demo org). Null
			// lastAccessedAt counts as "never accessed" → also eligible after
			// creation + threshold. We gate on activated=true so we never
			// pause something that hasn't had a real cycle yet.
			const candidates = await prisma.environment.findMany({
				where: {
					activated: true,
					continuousPaused: false,
					OR: [
						{ lastAccessedAt: { lt: cutoff } },
						{ lastAccessedAt: null, createdAt: { lt: cutoff } },
					],
					organization: {
						orgType: { not: "demo" },
					},
				},
				select: {
					id: true,
					organizationId: true,
					domain: true,
					organization: {
						select: { name: true, ownerId: true },
					},
				},
				take: 50, // batch cap — long tail catches up on the next hour
			});

			if (candidates.length === 0) return;

			for (const env of candidates) {
				try {
					await prisma.environment.update({
						where: { id: env.id },
						data: { continuousPaused: true },
					});
					// Record the event via NotificationLog so the messaging
					// cron (or a downstream job) can deliver a real email.
					// We don't send the email inline here — NotificationLog is
					// the queue/record, and the notification dispatcher reads
					// from it. Keeps this cron fast and idempotent.
					await prisma.notificationLog.create({
						data: {
							userId: env.organization?.ownerId ?? null,
							channel: "email",
							event: "inactivity_pause",
							recipient: env.organization?.ownerId ?? "unknown",
							subject: `Audits paused for ${env.domain}`,
							status: "skipped", // actual send is handled downstream
							provider: "internal",
						},
					});
					console.log(
						`[inactivity-pause] paused env=${env.id} domain=${env.domain} org=${env.organizationId}`,
					);
				} catch (err) {
					console.error(
						`[inactivity-pause] failed to pause env=${env.id}:`,
						err,
					);
				}
			}
		} catch (err) {
			console.error("[inactivity-pause] pass failed:", err);
		}
		});
	};

	// Boot pass — catch anything missed while the process was down.
	runInactivityPause();
	setInterval(runInactivityPause, INACTIVITY_PAUSE_INTERVAL_MS);
	console.log("✓ Inactivity pause cron registered (1h interval, 14d threshold)");
}
