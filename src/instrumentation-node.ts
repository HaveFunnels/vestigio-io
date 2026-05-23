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
// 3.13 — Daily digest email. Runs once per day. Sends narrative
// briefing with cross-signal highlights, health score, top changes.
const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INACTIVITY_PAUSE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INACTIVITY_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
// Dispatcher drains NotificationLog rows queued as status="skipped".
// Email delivery isn't time-critical (inactivity-pause tolerates minutes
// of latency) but we don't want rows piling up either. 5min keeps the
// queue age low enough that operators won't file a "why didn't I get
// an email" ticket before the first tick fires.
const NOTIFICATION_DISPATCHER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Wave 5 Fase 3 — scheduler runs once per hour. Enough to cover every
// plan cadence (Max's 15min hot cycles will sample 4x per hot window;
// Starter's weekly cold lands within 1h of due time).
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// Wave 21.2 — probe cron tick. Fires every 60s; per-env cadence is
// enforced inside the probe runner via the probeLastRunAt debounce.
// Max-plan envs probe every 5 min, pro every 15 min, vestigio every
// 60 min — picking 60s here means a freshly-due env never waits more
// than a tick to be picked up regardless of plan.
const PROBE_INTERVAL_MS = 60 * 1000; // 60 seconds

export async function registerNodeInstrumentation(): Promise<void> {
	// Fail-fast guard: VESTIGIO_SECRET_KEY must be present in production.
	// Without it, encryptSecret() silently falls back to a `dev:` base64
	// scheme that anyone with DB read can decrypt. The existing
	// enforceProductionSecrets() function was written for this exact
	// purpose but had no caller — added here so a missing key crashes the
	// boot rather than degrading the security boundary at first write.
	try {
		const { enforceProductionSecrets } = await import(
			"../apps/platform/secret-service"
		);
		enforceProductionSecrets();
	} catch (err) {
		// Re-throw — startup failure is the correct behavior here.
		console.error("✖ Secret enforcement failed:", err);
		throw err;
	}

	// OpenTelemetry SDK MUST initialize before any other module loads its
	// http/Prisma/Redis client — the SDK patches those modules at boot so
	// subsequent imports can be traced transparently. Putting init here
	// (Node-only file, dynamically imported from instrumentation.ts) keeps
	// the OTel SDK + gRPC transitive deps out of the Edge bundle entirely.
	try {
		const { initOtel } = await import("@/libs/otel");
		initOtel({ serviceName: "vestigio-web" });
	} catch (err) {
		console.warn("⚠ OTel initialization failed:", err);
	}

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
	// Wave 5 Fase 1A fix (C1): explicitly initialize the Redis client at
	// boot. Without this call, getRedis() (the sync getter used by the
	// queue + leader-election + chromium pool) returns null indefinitely
	// because nothing else triggers the lazy connect. Net effect of
	// missing this: queue is a no-op, every dispatch falls back to in-
	// process Promise.then(), leader election always returns true on every
	// replica → N-fold heal/inactivity-pause work. Discovered by Fase 1
	// audit agent (issue C1).
	const { initRedis } = await import("@/libs/redis");
	await initRedis().catch((err) => {
		console.warn("[instrumentation] initRedis failed:", err);
	});

	// Wave 5 Fase 2 fix (#15): legacy backfill. Pre-Fase-2 envs don't
	// have Environment.activated=true even though they have completed
	// audit cycles. Without this, the JWT.hasActivatedEnv stays false
	// for existing customers and they get bounced into onboarding on
	// next login. One-shot idempotent updateMany at boot — once all envs
	// are flipped, subsequent runs are zero-row no-ops.
	try {
		const backfilled = await prisma.environment.updateMany({
			where: {
				activated: false,
				auditCycles: {
					some: { status: "complete" },
				},
			},
			data: { activated: true },
		});
		if (backfilled.count > 0) {
			console.log(
				`[instrumentation] backfilled activated=true on ${backfilled.count} legacy envs`,
			);
		}
	} catch (err) {
		console.warn("[instrumentation] activated backfill failed:", err);
	}

	// Wave 22.5 Tier 3 — seed the catch-all Surface for any env that
	// landed BEFORE the surface_entity migration ran OR was created in
	// the small window between the migration applying and the next
	// backfill touch. Idempotent: findMany of envs WITHOUT surfaces +
	// createMany skipDuplicates.
	try {
		const envsWithoutSurface = await prisma.environment.findMany({
			where: { surfaces: { none: {} } },
			select: { id: true },
		});
		if (envsWithoutSurface.length > 0) {
			await prisma.surface.createMany({
				data: envsWithoutSurface.map((e) => ({
					environmentId: e.id,
					kind: "public",
					urlPattern: "*",
					label: "Site público",
					authRequired: false,
					displayOrder: 100,
				})),
				skipDuplicates: true,
			});
			console.log(
				`[instrumentation] seeded default Surface for ${envsWithoutSurface.length} env(s) missing one`,
			);
		}
	} catch (err) {
		console.warn("[instrumentation] surface seed failed:", err);
	}

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

			// Plan-based behavioral event retention:
			//   vestigio (starter) + pro → 30 days
			//   max                      → 90 days
			// Walks each plan tier separately so an org on "max" keeps
			// 90 days while "vestigio" orgs get pruned at 30 days.
			// Indexed by receivedAt for fast deleteMany.
			const RETENTION_DAYS: Record<string, number> = {
				vestigio: 30,
				pro: 30,
				max: 90,
			};
			const DEFAULT_RETENTION_DAYS = 30;

			// Group environments by their org's plan to apply per-plan retention.
			const orgsWithPlan = await prisma.organization.findMany({
				select: { id: true, plan: true },
			});
			const planByOrgId = new Map(orgsWithPlan.map((o) => [o.id, o.plan || "vestigio"]));

			const envRows = await prisma.environment.findMany({
				select: { id: true, organizationId: true },
			});

			// Bucket env IDs by retention window.
			const envsByRetention = new Map<number, string[]>();
			for (const env of envRows) {
				const plan = planByOrgId.get(env.organizationId) || "vestigio";
				const days = RETENTION_DAYS[plan] ?? DEFAULT_RETENTION_DAYS;
				let arr = envsByRetention.get(days);
				if (!arr) {
					arr = [];
					envsByRetention.set(days, arr);
				}
				arr.push(env.id);
			}

			let totalPruned = 0;
			for (const [days, envIds] of envsByRetention) {
				const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
				const result = await prisma.rawBehavioralEvent.deleteMany({
					where: {
						envId: { in: envIds },
						receivedAt: { lt: cutoff },
					},
				});
				totalPruned += result.count;
			}
			if (totalPruned > 0) {
				console.log(`[lead-cleanup] pruned ${totalPruned} stale behavioral events (plan-based)`);
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
			//
			// Wave 5 Fase 2 fix (#11): use an explicit `in` list instead of
			// `not: "demo"`. Prisma `not` semantics include null rows, so
			// any legacy org with `orgType=null` would be auto-paused. The
			// schema default is "customer" but pre-migration rows may be
			// null. Listing only the orgTypes we DO want to pause is safer.
			const candidates = await prisma.environment.findMany({
				where: {
					activated: true,
					continuousPaused: false,
					OR: [
						{ lastAccessedAt: { lt: cutoff } },
						{ lastAccessedAt: null, createdAt: { lt: cutoff } },
					],
					organization: {
						orgType: { in: ["customer", "trial"] },
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

			// Second round-trip: resolve owner emails. Organization.ownerId is
			// a plain string field, not a Prisma relation, so we can't nest
			// the select. A single IN query is fine at batch=50 and gives us
			// the email needed on NotificationLog.recipient so the dispatcher
			// has something real to send to.
			const ownerIds = Array.from(
				new Set(
					candidates
						.map((c) => c.organization?.ownerId)
						.filter((id): id is string => Boolean(id)),
				),
			);
			const ownerEmailsById = new Map<string, string | null>();
			if (ownerIds.length > 0) {
				const owners = await prisma.user.findMany({
					where: { id: { in: ownerIds } },
					select: { id: true, email: true },
				});
				for (const u of owners) {
					ownerEmailsById.set(u.id, u.email);
				}
			}

			if (candidates.length === 0) return;

			for (const env of candidates) {
				// Wave 5 Fase 2 fix (H4): skip rows whose organization
				// relation is somehow null (stale FK, soft-delete artifact)
				// — otherwise `recipient: "unknown"` poisons NotificationLog.
				if (!env.organization?.ownerId) {
					console.warn(
						`[inactivity-pause] skipping env=${env.id} (no owner resolvable)`,
					);
					continue;
				}
				const ownerEmail = ownerEmailsById.get(env.organization.ownerId) ?? null;
				try {
					await prisma.environment.update({
						where: { id: env.id },
						data: { continuousPaused: true },
					});
					// Record the event via NotificationLog so the dispatcher
					// cron (notification-dispatcher.ts) can deliver a real
					// email. We don't send inline here — NotificationLog is
					// the queue/record, the dispatcher drains it. Keeps this
					// cron fast and idempotent.
					//
					// If ownerEmail is null (user deleted their email or the
					// owner is a platform shell without email) we still write
					// the row as `skipped` but the dispatcher will fail-fast
					// on the invalid recipient and surface the bad data via
					// errorMsg instead of burning API calls on null sends.
					await prisma.notificationLog.create({
						data: {
							userId: env.organization.ownerId,
							channel: "email",
							event: "inactivity_pause",
							recipient: ownerEmail || "",
							subject: `Audits paused for ${env.domain}`,
							status: "skipped", // actual send is handled downstream
							provider: "internal",
						},
					});
					console.log(
						`[inactivity-pause] paused env=${env.id} domain=${env.domain} org=${env.organizationId} notify=${ownerEmail ? "queued" : "skipped-no-email"}`,
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

	// ── Audit scheduler cron (Wave 5 Fase 3) ──
	// Hourly leader-elected pass. Walks every activated env, checks
	// plan cadence, enqueues hot/warm/cold cycles as they come due.
	// See apps/audit-runner/scheduler.ts for the per-env decision logic.
	const { runSchedulerPass } = await import("../apps/audit-runner/scheduler");
	const runScheduler = async () => {
		await withLeadership("audit-scheduler", { ttlSec: 90 }, async () => {
			try {
				const result = await runSchedulerPass();
				if (result.cyclesEnqueued > 0) {
					console.log(
						`[audit-scheduler] pass: evaluated=${result.envsEvaluated} enqueued=${result.cyclesEnqueued} hot=${result.enqueuedByType.hot} warm=${result.enqueuedByType.warm} cold=${result.enqueuedByType.cold}`,
					);
				}
			} catch (err) {
				console.error("[audit-scheduler] pass failed:", err);
			}
		});
	};
	// Boot pass — catch anything that was due while the process was
	// down, but do it async so we don't block startup.
	runScheduler();
	setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
	console.log("✓ Audit scheduler cron registered (1h interval)");

	// ── Probe cron (Wave 21.2) ──
	// Plan-cadence probing of critical pages. The cron tick is 60s but
	// each env's actual cadence is enforced inside runProbeCronPass via
	// the probeLastRunAt debounce (max=5min, pro=15min, vestigio=60min).
	// On hash diff vs prior probe, the cron enqueues a targeted audit
	// cycle via the audit-cycle-queue with scopeJson pointing at the
	// changed URL — the audit-runner reads scopeJson and routes to
	// engine.run({ scope: { kind: 'targeted', url } }).
	const { runProbeCronPass } = await import("../apps/probe-runner/cron-pass");
	const runProbe = async () => {
		await withLeadership("probe-cron", { ttlSec: 90 }, async () => {
			try {
				const r = await runProbeCronPass(prisma);
				if (r.envsProbed > 0 || r.changesDetected > 0) {
					console.log(
						`[probe-cron] scanned=${r.envsScanned} probed=${r.envsProbed} skipped=${r.envsSkipped} changes=${r.changesDetected} enqueued=${r.cyclesEnqueued} errors=${r.errors} took=${r.durationMs}ms`,
					);
				}
			} catch (err) {
				console.error("[probe-cron] pass failed:", err);
			}
		});
	};
	// No boot pass — every env's debounce is the source of truth, and
	// the first tick lands within 60s anyway. Skipping boot avoids a
	// surge of probes on every restart.
	setInterval(runProbe, PROBE_INTERVAL_MS);
	console.log("✓ Probe cron registered (60s tick; per-env cadence via debounce)");

	// ── MP PIX dunning cron ──
	// Hourly leader-elected pass that issues fresh PIX charges, fires
	// 5d/2d/0d reminder emails, and suspends orgs that hit D+14 past
	// dueAt without an approved payment. Card-recurring users are
	// skipped (MP handles those via authorized_payment events).
	const { runMpDunningSweep } = await import("../apps/audit-runner/dunning-pix");
	const runDunning = async () => {
		await withLeadership("mp-pix-dunning", { ttlSec: 90 }, async () => {
			try {
				const r = await runMpDunningSweep();
				if (r.remindersSent > 0 || r.chargesCreated > 0 || r.suspended > 0) {
					console.log(
						`[mp-pix-dunning] users=${r.usersEvaluated} charges=${r.chargesCreated} reminders=${r.remindersSent} suspended=${r.suspended}`,
					);
				}
			} catch (err) {
				console.error("[mp-pix-dunning] sweep failed:", err);
			}
		});
	};
	runDunning();
	setInterval(runDunning, SCHEDULER_INTERVAL_MS);
	console.log("✓ MP PIX dunning cron registered (1h interval)");

	// ── Notification dispatcher cron ──
	// Drains NotificationLog rows queued with status="skipped". The only
	// current producer is the inactivity-pause cron above; future producers
	// (trial ending warnings, plan downgrades, etc.) plug in via the
	// buildEmailBody switch in notification-dispatcher.ts.
	const { runNotificationDispatcher } = await import("./libs/notification-dispatcher");
	const runDispatcher = async () => {
		await withLeadership(
			"notification-dispatcher",
			{ ttlSec: 60 },
			async () => {
				try {
					const result = await runNotificationDispatcher();
					if (result.sent > 0 || result.failed > 0 || result.dropped > 0) {
						console.log(
							`[notification-dispatcher] pass: evaluated=${result.evaluated} sent=${result.sent} failed=${result.failed} dropped=${result.dropped}`,
						);
					}
				} catch (err) {
					console.error("[notification-dispatcher] pass failed:", err);
				}
			},
		);
	};
	// Boot pass — drain anything queued while the process was down.
	runDispatcher();
	setInterval(runDispatcher, NOTIFICATION_DISPATCHER_INTERVAL_MS);
	console.log("✓ Notification dispatcher cron registered (5m interval)");

	// ── Product telemetry crons (3.16) ──────────────────────────

	const ENGAGEMENT_SCORE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
	const PRODUCT_EVENT_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

	const { computeEngagementScores, pruneOldProductEvents } = await import(
		"@/libs/product-telemetry"
	);

	// Engagement score computation — hourly, leader-elected
	const runEngagementScore = async () => {
		await withLeadership(
			"engagement-score",
			{ ttlSec: 120 },
			async () => {
				try {
					const result = await computeEngagementScores();
					if (result.envsScored > 0) {
						console.log(
							`[engagement-score] scored ${result.envsScored} envs, avg=${result.avgScore.toFixed(1)}`,
						);
					}
				} catch (err) {
					console.error("[engagement-score] pass failed:", err);
				}
			},
		);
	};
	runEngagementScore(); // boot pass
	setInterval(runEngagementScore, ENGAGEMENT_SCORE_INTERVAL_MS);
	console.log("✓ Engagement score cron registered (1h interval)");

	// Product event pruning — daily, 90-day retention, leader-elected
	const runProductEventPrune = async () => {
		await withLeadership(
			"product-event-prune",
			{ ttlSec: 120 },
			async () => {
				try {
					const result = await pruneOldProductEvents(90);
					if (result.count > 0) {
						console.log(
							`[product-event-prune] deleted ${result.count} events older than 90 days`,
						);
					}
				} catch (err) {
					console.error("[product-event-prune] pass failed:", err);
				}
			},
		);
	};
	runProductEventPrune(); // boot pass
	setInterval(runProductEventPrune, PRODUCT_EVENT_PRUNE_INTERVAL_MS);
	console.log("✓ Product event prune cron registered (24h interval)");

	// ── Inventory orphan hard-delete cron ──
	// Daily, leader-elected. Hard-deletes PageInventoryItem rows that
	// were soft-deleted (removedAt set) more than 60 days ago. The
	// 60-day grace window lets a page be "resurrected" if the customer
	// reinstates a removed URL — beyond that, the row is genuinely dead.
	const INVENTORY_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
	const INVENTORY_PRUNE_GRACE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
	const runInventoryPrune = async () => {
		await withLeadership(
			"inventory-orphan-prune",
			{ ttlSec: 120 },
			async () => {
				try {
					const cutoff = new Date(Date.now() - INVENTORY_PRUNE_GRACE_MS);
					const result = await prisma.pageInventoryItem.deleteMany({
						where: { removedAt: { lt: cutoff } },
					});
					if (result.count > 0) {
						console.log(
							`[inventory-orphan-prune] hard-deleted ${result.count} rows (removed > 60d ago)`,
						);
					}
				} catch (err) {
					console.error("[inventory-orphan-prune] pass failed:", err);
				}
			},
		);
	};
	runInventoryPrune(); // boot pass — drain anything past cutoff
	setInterval(runInventoryPrune, INVENTORY_PRUNE_INTERVAL_MS);
	console.log("✓ Inventory orphan prune cron registered (24h interval, 60d grace)");

	// ── 21.5: Monthly value-caught report ──
	// Daily-with-idempotency cron. Each tick covers the prior calendar
	// month and only fires within the first 7 days of the new month.
	// The NotificationLog `tag` field is the dedup key, so re-runs are
	// safe even without a leader-elected lock (we still scope-lock for
	// concurrent-replica protection).
	const { runMonthlyValueCaughtPass } = await import("./libs/value-caught-monthly");
	const runValueCaughtMonthly = async () => {
		await withLeadership(
			"value-caught-monthly",
			{ ttlSec: 300 },
			async () => {
				try {
					const r = await runMonthlyValueCaughtPass();
					if (r.envsEvaluated > 0 || r.reportsSent > 0) {
						console.log(
							`[value-caught-monthly] envs=${r.envsEvaluated} sent=${r.reportsSent} skipped=${r.skipped} errors=${r.errors}`,
						);
					}
				} catch (err) {
					console.error("[value-caught-monthly] pass failed:", err);
				}
			},
		);
	};
	// Run once per day. The internal early-month gate inside the pass
	// is what limits actual delivery to days 1-7 of each month.
	const VALUE_CAUGHT_INTERVAL_MS = 24 * 60 * 60 * 1000;
	// Boot pass — catches early-month customers if the previous process
	// missed the window (e.g. deploy at 23:59 on day 1).
	runValueCaughtMonthly();
	setInterval(runValueCaughtMonthly, VALUE_CAUGHT_INTERVAL_MS);
	console.log("✓ Value-caught monthly cron registered (24h interval, fires days 1-7 of each month)");

	// ── 3.13: Daily digest email ──
	const { sendDailyDigests } = await import("./libs/cycle-digest");
	const runDigest = async () => {
		await withLeadership(
			"daily-digest",
			{ ttlSec: 300 },
			async () => {
				try {
					const { sent, skipped } = await sendDailyDigests();
					console.log(`[daily-digest] sent=${sent} skipped=${skipped}`);
				} catch (err) {
					console.error("[daily-digest] pass failed:", err);
				}
			},
		);
	};
	// Don't run on boot — first digest fires after 24h
	setInterval(runDigest, DIGEST_INTERVAL_MS);
	console.log("✓ Daily digest cron registered (24h interval)");
}
