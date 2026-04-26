// ──────────────────────────────────────────────
// Dashboard aggregator — Phase 2 backend
//
// Computes the full `DashboardData` payload for one environment
// from real Prisma data. Each top-level slice is computed in its
// own helper with isolated try/catch so a single broken slice
// (e.g. PlaybookRun query fails) cannot blank the whole dashboard
// — the rest still renders, the broken slice falls back to a
// safe zero-state.
//
// **Where this lives:** the API route is a thin wrapper around
// this function. Keeping the aggregator separate from the route
// means it can be unit-tested directly with a mocked Prisma
// client and reused server-side from anywhere (e.g. a future
// PDF export, a digest email).
//
// **What we DON'T do here:**
//   - No caching. The route handler can decide to wrap with
//     unstable_cache later. The aggregator is pure compute.
//   - No demo-data substitution. The route layer detects demo
//     orgs and returns MOCK_DASHBOARD_DATA without ever hitting
//     this aggregator.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
	ActivityHeatmapData,
	ActivityHeatmapDay,
	AdSpendData,
	ChangeReportData,
	ChangeReportEntry,
	CrossSignalChain,
	CrossSignalData,
	DashboardData,
	ExposureData,
	HealthScoreData,
	MoneyRecoveredData,
} from "./types";
import {
	captionForActivityHeatmap,
	captionForChangeReport,
	captionForExposure,
	captionForHealthScore,
	captionForMoneyRecovered,
} from "./captions";

const DEFAULT_CURRENCY = "USD";

// Pack → segmented-bar color mapping. Mirrors the colors used in
// MOCK_DASHBOARD_DATA so the visual identity stays stable when
// the page flips from mock to real data.
const PACK_COLORS: Record<string, string> = {
	revenue_integrity: "bg-emerald-500",
	revenue: "bg-emerald-500",
	scale_readiness: "bg-amber-500",
	scale: "bg-amber-500",
	chargeback_resilience: "bg-red-500",
	chargeback: "bg-red-500",
	behavioral: "bg-blue-500",
	saas: "bg-violet-500",
};

function colorForPack(pack: string): string {
	return PACK_COLORS[pack] ?? "bg-content-faint";
}

// Truncate impact midpoint (stored as monthly $ value) to cents.
// Findings store `impactMidpoint` as a Float in dollars per month.
function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

// ──────────────────────────────────────────────
// Slice 1 — Money Recovered
//
// Sum of impactMidpoint for findings whose `changeClass = 'resolved'`.
// A resolved finding represents a previously open issue that the
// most recent cycle confirmed is no longer present, i.e. revenue
// the user has clawed back. We bucket the rolling totals by the
// finding's `createdAt` (when the cycle that resolved it ran).
// ──────────────────────────────────────────────
async function computeMoneyRecovered(
	prisma: PrismaClient,
	envId: string
): Promise<MoneyRecoveredData> {
	try {
		const now = new Date();
		const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

		// Three attribution buckets, honest accounting:
		//
		//   1. CONFIRMED (auto-resolved) — a previously open finding
		//      showed `changeClass='resolved'` in a recent cycle.
		//      Vestigio detected the recovery. Solid signal.
		//   2. CONFIRMED (verified UserAction) — UserAction marked
		//      `done` AND the post-cycle attribution job stamped
		//      `verifiedResolvedAt`. The user's work was proven by
		//      a subsequent cycle. Strongest signal.
		//   3. CLAIMED (unverified UserAction) — UserAction marked
		//      `done` but no cycle has confirmed yet. Shown as a
		//      secondary "+$X awaiting confirmation" line so the
		//      headline doesn't lie when the remediation didn't
		//      actually take.
		//
		// Dedup rule: a single remediation can show up in BOTH bucket 1
		// (the cycle detected the auto-resolution) and bucket 2 (the
		// UserAction got its verifiedResolvedAt stamp from the same
		// cycle). Counting both would double the recovery for that
		// one fix. We prefer the UserAction baseline when both exist
		// because it was frozen at the moment the user committed to
		// the work — more accurate than the residual impact the
		// auto-resolved finding row happens to carry.
		//
		// We dedup by inferenceKey (stable per-finding-concept, shared
		// across cycles) rather than findingId (unique per cycle row).
		const [resolved, doneActions] = await Promise.all([
			prisma.finding.findMany({
				where: {
					environmentId: envId,
					changeClass: "resolved",
					createdAt: { gte: ninetyDaysAgo },
				},
				select: {
					impactMidpoint: true,
					createdAt: true,
					inferenceKey: true,
				},
			}),
			prisma.userAction.findMany({
				where: {
					environmentId: envId,
					status: "done",
					doneAt: { gte: ninetyDaysAgo },
				},
				select: {
					baselineImpactMidpoint: true,
					doneAt: true,
					createdAt: true,
					verifiedResolvedAt: true,
					finding: { select: { inferenceKey: true } },
				},
			}),
		]);

		const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
		const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

		let confirmedCents = 0;
		let claimedCents = 0;
		let last7dCents = 0;
		let last30dCents = 0;
		let lastUpdatedAt: Date | null = null;

		// Build the dedup set first so Bucket 1 can skip overlaps.
		const coveredByUserAction = new Set<string>();
		for (const a of doneActions) {
			const key = a.finding?.inferenceKey;
			if (key) coveredByUserAction.add(key);
		}

		// Bucket 1: auto-resolved findings → confirmed, except when a
		// UserAction already accounts for this inferenceKey.
		for (const f of resolved) {
			if (coveredByUserAction.has(f.inferenceKey)) continue;
			const cents = dollarsToCents(f.impactMidpoint);
			confirmedCents += cents;
			const ts = f.createdAt.getTime();
			if (ts >= sevenDaysAgo) last7dCents += cents;
			if (ts >= thirtyDaysAgo) last30dCents += cents;
			if (!lastUpdatedAt || f.createdAt > lastUpdatedAt) {
				lastUpdatedAt = f.createdAt;
			}
		}

		// Buckets 2 and 3: UserAction done. Split on verifiedResolvedAt.
		for (const a of doneActions) {
			if (a.baselineImpactMidpoint == null) continue;
			const cents = dollarsToCents(a.baselineImpactMidpoint);
			if (a.verifiedResolvedAt) {
				confirmedCents += cents;
			} else {
				claimedCents += cents;
			}
			const when = a.doneAt ?? a.createdAt;
			const ts = when.getTime();
			if (ts >= sevenDaysAgo) last7dCents += cents;
			if (ts >= thirtyDaysAgo) last30dCents += cents;
			if (!lastUpdatedAt || when > lastUpdatedAt) {
				lastUpdatedAt = when;
			}
		}

		const result: MoneyRecoveredData = {
			totalCents: confirmedCents + claimedCents,
			confirmedCents,
			claimedCents,
			last7dCents,
			last30dCents,
			currency: DEFAULT_CURRENCY,
			lastUpdatedAt: (lastUpdatedAt ?? now).toISOString(),
			caption: "",
		};
		result.caption = captionForMoneyRecovered(result);
		return result;
	} catch (err) {
		console.warn("[dashboard/aggregator] money_recovered failed:", err);
		const fallback: MoneyRecoveredData = {
			totalCents: 0,
			confirmedCents: 0,
			claimedCents: 0,
			last7dCents: 0,
			last30dCents: 0,
			currency: DEFAULT_CURRENCY,
			lastUpdatedAt: new Date().toISOString(),
			caption: "",
		};
		fallback.caption = captionForMoneyRecovered(fallback);
		return fallback;
	}
}

// ──────────────────────────────────────────────
// Slice 2 — Health Score
//
// Composite of three sub-scores, each ∈ [0, 100]:
//
//   structural    — penalised by open critical/high findings
//   actionQuality — playbook completion rate over the last 30d
//   verification  — share of latest-cycle findings that are
//                   `verification_maturity = 'confirmed'`
//
// 30-day trend: we re-compute the structural component for each of
// the most recent 30 audit cycles. Cheap because all the data is
// already in the Finding table; no new snapshot table needed for
// Phase 2. If the user has fewer than 30 cycles we pad the head
// of the array with the oldest known value so the sparkline still
// has 30 points to draw.
// ──────────────────────────────────────────────
function structuralFromCounts(
	critical: number,
	high: number,
	medium: number
): number {
	const raw = 100 - (critical * 10 + high * 5 + medium * 2);
	return Math.max(0, Math.min(100, raw));
}

async function computeHealthScore(
	prisma: PrismaClient,
	orgId: string,
	envId: string
): Promise<HealthScoreData> {
	try {
		// Find the most recent cycle so we know which findings count
		// toward "current" structural and verification scores.
		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: envId, status: "complete" },
			orderBy: { createdAt: "desc" },
			select: { id: true, createdAt: true },
		});

		if (!latestCycle) {
			const empty: HealthScoreData = {
				current: 0,
				deltaVsLastCycle: 0,
				trend30d: Array(30).fill(0),
				components: { structural: 0, actionQuality: 0, verification: 0 },
				caption: "",
			};
			empty.caption = captionForHealthScore(empty);
			return empty;
		}

		// Pull severity + verification counts for the latest cycle.
		const [latestFindings, severityGroups] = await Promise.all([
			prisma.finding.findMany({
				where: { cycleId: latestCycle.id },
				select: { severity: true, verificationMaturity: true },
			}),
			prisma.finding.groupBy({
				by: ["severity"],
				where: { cycleId: latestCycle.id },
				_count: { _all: true },
			}),
		]);

		const sevCounts: Record<string, number> = {
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			none: 0,
		};
		for (const row of severityGroups) {
			sevCounts[row.severity] = row._count._all;
		}

		const structural = structuralFromCounts(
			sevCounts.critical,
			sevCounts.high,
			sevCounts.medium
		);

		const totalLatest = latestFindings.length;
		const confirmedLatest = latestFindings.filter(
			(f) => f.verificationMaturity === "confirmed"
		).length;
		const verification =
			totalLatest > 0 ? Math.round((confirmedLatest / totalLatest) * 100) : 50;

		// Action quality: completed PlaybookRuns / total over the last 30 days.
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		let actionQuality = 50;
		try {
			const runs = await prisma.playbookRun.findMany({
				where: { orgId, startedAt: { gte: thirtyDaysAgo } },
				select: { status: true },
			});
			if (runs.length > 0) {
				const completed = runs.filter((r) => r.status === "completed").length;
				actionQuality = Math.round((completed / runs.length) * 100);
			}
		} catch (err) {
			console.warn("[dashboard/aggregator] playbook query failed:", err);
		}

		const current = Math.round((structural + actionQuality + verification) / 3);

		// Compute the 30-day trend by walking the last 30 cycles and
		// re-running the structural formula on each cycle's findings.
		// This is one query (groupBy across cycles) so it stays cheap.
		const recentCycles = await prisma.auditCycle.findMany({
			where: { environmentId: envId, status: "complete" },
			orderBy: { createdAt: "desc" },
			take: 30,
			select: { id: true, createdAt: true },
		});

		const cycleScores: number[] = [];
		if (recentCycles.length > 0) {
			const cycleIds = recentCycles.map((c) => c.id);
			const sevByCycle = await prisma.finding.groupBy({
				by: ["cycleId", "severity"],
				where: { cycleId: { in: cycleIds } },
				_count: { _all: true },
			});

			const perCycle = new Map<string, { c: number; h: number; m: number }>();
			for (const id of cycleIds) perCycle.set(id, { c: 0, h: 0, m: 0 });
			for (const row of sevByCycle) {
				const bucket = perCycle.get(row.cycleId);
				if (!bucket) continue;
				if (row.severity === "critical") bucket.c = row._count._all;
				else if (row.severity === "high") bucket.h = row._count._all;
				else if (row.severity === "medium") bucket.m = row._count._all;
			}

			// Walk oldest → newest so the chart reads left-to-right correctly.
			for (let i = recentCycles.length - 1; i >= 0; i--) {
				const cyc = recentCycles[i];
				const bucket = perCycle.get(cyc.id) ?? { c: 0, h: 0, m: 0 };
				cycleScores.push(structuralFromCounts(bucket.c, bucket.h, bucket.m));
			}
		}

		// Pad to 30 entries by repeating the oldest known score.
		while (cycleScores.length < 30) {
			cycleScores.unshift(cycleScores[0] ?? current);
		}
		const trend30d = cycleScores.slice(-30);

		// Delta vs the score from the second-most-recent cycle.
		const previousCycleScore =
			cycleScores.length >= 2 ? cycleScores[cycleScores.length - 2] : current;
		const deltaVsLastCycle = current - previousCycleScore;

		const result: HealthScoreData = {
			current,
			deltaVsLastCycle,
			trend30d,
			components: { structural, actionQuality, verification },
			caption: "",
		};
		result.caption = captionForHealthScore(result);
		return result;
	} catch (err) {
		console.warn("[dashboard/aggregator] health_score failed:", err);
		const fallback: HealthScoreData = {
			current: 0,
			deltaVsLastCycle: 0,
			trend30d: Array(30).fill(0),
			components: { structural: 0, actionQuality: 0, verification: 0 },
			caption: "",
		};
		fallback.caption = captionForHealthScore(fallback);
		return fallback;
	}
}

// ──────────────────────────────────────────────
// Slice 3 — Exposure
//
// Sum of monthly impact across all OPEN findings (anything except
// `changeClass = 'resolved'`) in the most recent cycle. Per-pack
// breakdown for the segmented bar. Delta vs the previous cycle so
// the headline number can show "exposure decreased by $X.Xk".
//
// Inverted color rule: down is GOOD here (less exposed = healthier).
// The widget handles the visual inversion; the aggregator just
// returns the signed delta.
// ──────────────────────────────────────────────
async function computeExposure(
	prisma: PrismaClient,
	envId: string
): Promise<ExposureData> {
	try {
		const cycles = await prisma.auditCycle.findMany({
			where: { environmentId: envId, status: "complete" },
			orderBy: { createdAt: "desc" },
			take: 2,
			select: { id: true },
		});

		if (cycles.length === 0) {
			const empty: ExposureData = {
				monthlyCents: 0,
				deltaVsLastCycleCents: 0,
				currency: DEFAULT_CURRENCY,
				byPack: [],
				criticalOpenCount: 0,
				criticalDeltaVsLastCycle: 0,
				criticalOpenItems: [],
				caption: "",
			};
			empty.caption = captionForExposure(empty);
			return empty;
		}

		const latestCycleId = cycles[0].id;
		const previousCycleId = cycles[1]?.id ?? null;

		// Fetch each cycle's open findings ONCE and reuse the rows for
		// both the impact aggregation and the critical-severity count,
		// instead of issuing two separate queries per cycle.
		// We pull projection JSON only for the LATEST cycle (used to
		// extract titles for the criticalOpenItems list); previous-cycle
		// rows skip projection to keep the query light.
		const latestRows = await prisma.finding.findMany({
			where: { cycleId: latestCycleId, NOT: { changeClass: "resolved" } },
			select: {
				id: true,
				impactMidpoint: true,
				pack: true,
				severity: true,
				surface: true,
				inferenceKey: true,
				projection: true,
			},
		});

		const previousRows = previousCycleId
			? await prisma.finding.findMany({
					where: {
						cycleId: previousCycleId,
						NOT: { changeClass: "resolved" },
					},
					select: { impactMidpoint: true, pack: true, severity: true },
				})
			: null;

		const sumOpenFromRows = (
			rows: Array<{ impactMidpoint: number; pack: string; severity: string }>
		) => {
			let total = 0;
			let critical = 0;
			const byPack = new Map<string, number>();
			for (const r of rows) {
				const cents = dollarsToCents(r.impactMidpoint);
				total += cents;
				byPack.set(r.pack, (byPack.get(r.pack) ?? 0) + cents);
				if (r.severity === "critical") critical += 1;
			}
			return { total, byPack, critical };
		};

		const latest = sumOpenFromRows(latestRows);
		const previous = previousRows ? sumOpenFromRows(previousRows) : null;

		const byPack = Array.from(latest.byPack.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([pack, cents]) => ({
				pack,
				cents,
				colorClass: colorForPack(pack),
			}));

		// Top-3 critical items by impact for the inline list display
		// in OpenCriticalKpi. Title comes from the projection JSON
		// (already fetched above), with a defensive fallback so a
		// corrupt projection row never blows up the dashboard.
		const criticalOpenItems = latestRows
			.filter((r) => r.severity === "critical")
			.sort((a, b) => b.impactMidpoint - a.impactMidpoint)
			.slice(0, 3)
			.map((r) => {
				let title = "Critical finding";
				try {
					const parsed = JSON.parse(r.projection);
					title =
						parsed?.title ?? parsed?.title_short ?? parsed?.headline ?? title;
				} catch {
					/* projection JSON corrupt — keep fallback */
				}
				return {
					id: r.id,
					inferenceKey: r.inferenceKey,
					title,
					surface: r.surface,
					impactCents: dollarsToCents(r.impactMidpoint),
				};
			});

		const result: ExposureData = {
			monthlyCents: latest.total,
			deltaVsLastCycleCents: previous ? latest.total - previous.total : 0,
			currency: DEFAULT_CURRENCY,
			byPack,
			criticalOpenCount: latest.critical,
			criticalDeltaVsLastCycle: previous
				? latest.critical - previous.critical
				: 0,
			criticalOpenItems,
			caption: "",
		};
		result.caption = captionForExposure(result);
		return result;
	} catch (err) {
		console.warn("[dashboard/aggregator] exposure failed:", err);
		const fallback: ExposureData = {
			monthlyCents: 0,
			deltaVsLastCycleCents: 0,
			currency: DEFAULT_CURRENCY,
			byPack: [],
			criticalOpenCount: 0,
			criticalDeltaVsLastCycle: 0,
			criticalOpenItems: [],
			caption: "",
		};
		fallback.caption = captionForExposure(fallback);
		return fallback;
	}
}

// ──────────────────────────────────────────────
// Slice 4 — Change Report
//
// What happened in the most recent cycle: new findings, regressions,
// resolved, plus a count of confirmed verifications. Lists are
// trimmed to a small N (5) so the widget never has to deal with
// pagination — extra entries can show "+12 more" if needed.
// ──────────────────────────────────────────────
const CHANGE_REPORT_LIMIT = 5;

function findingToEntry(f: {
	id: string;
	severity: string;
	impactMidpoint: number;
	projection: string;
}): ChangeReportEntry {
	let title = "Finding";
	try {
		const parsed = JSON.parse(f.projection);
		title =
			parsed?.title ?? parsed?.title_short ?? parsed?.headline ?? "Finding";
	} catch {
		// projection JSON corrupt — fall back to id-derived title
	}
	const severity =
		f.severity === "critical" ||
		f.severity === "high" ||
		f.severity === "medium" ||
		f.severity === "low"
			? f.severity
			: undefined;
	return {
		id: f.id,
		title,
		impactCents: dollarsToCents(f.impactMidpoint),
		severity,
	};
}

async function computeChangeReport(
	prisma: PrismaClient,
	envId: string
): Promise<ChangeReportData> {
	try {
		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: envId, status: "complete" },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});

		if (!latestCycle) {
			const empty: ChangeReportData = {
				newFindings: [],
				regressions: [],
				resolved: [],
				verificationsConfirmed: 0,
				caption: "",
			};
			empty.caption = captionForChangeReport(empty);
			return empty;
		}

		const [newFindings, regressions, resolved, verificationsConfirmed] =
			await Promise.all([
				prisma.finding.findMany({
					where: { cycleId: latestCycle.id, changeClass: "new_issue" },
					orderBy: { impactMidpoint: "desc" },
					take: CHANGE_REPORT_LIMIT,
					select: {
						id: true,
						severity: true,
						impactMidpoint: true,
						projection: true,
					},
				}),
				prisma.finding.findMany({
					where: { cycleId: latestCycle.id, changeClass: "regression" },
					orderBy: { impactMidpoint: "desc" },
					take: CHANGE_REPORT_LIMIT,
					select: {
						id: true,
						severity: true,
						impactMidpoint: true,
						projection: true,
					},
				}),
				prisma.finding.findMany({
					where: { cycleId: latestCycle.id, changeClass: "resolved" },
					orderBy: { impactMidpoint: "desc" },
					take: CHANGE_REPORT_LIMIT,
					select: {
						id: true,
						severity: true,
						impactMidpoint: true,
						projection: true,
					},
				}),
				prisma.finding.count({
					where: { cycleId: latestCycle.id, verificationMaturity: "confirmed" },
				}),
			]);

		const result: ChangeReportData = {
			newFindings: newFindings.map(findingToEntry),
			regressions: regressions.map(findingToEntry),
			resolved: resolved.map(findingToEntry),
			verificationsConfirmed,
			caption: "",
		};
		result.caption = captionForChangeReport(result);
		return result;
	} catch (err) {
		console.warn("[dashboard/aggregator] change_report failed:", err);
		const fallback: ChangeReportData = {
			newFindings: [],
			regressions: [],
			resolved: [],
			verificationsConfirmed: 0,
			caption: "",
		};
		fallback.caption = captionForChangeReport(fallback);
		return fallback;
	}
}

// ──────────────────────────────────────────────
// Slice 5 — Activity Heatmap
//
// 90 days of daily activity, where "activity" = audit cycles that
// completed on that day + playbook runs that completed on that day.
// Computed via two GROUP BY date_trunc raw queries (one for each
// source) merged into a single Map keyed by YYYY-MM-DD.
//
// Days with zero activity are present in the array — the heatmap
// renders them as empty cells, which is half the visual point of
// the streak grid.
// ──────────────────────────────────────────────
function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function buildEmptyHeatmap(): ActivityHeatmapDay[] {
	const days: ActivityHeatmapDay[] = [];
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	for (let i = 89; i >= 0; i--) {
		const d = new Date(today);
		d.setUTCDate(d.getUTCDate() - i);
		days.push({ date: isoDay(d), count: 0, cycles: 0, actionsResolved: 0 });
	}
	return days;
}

async function computeActivityHeatmap(
	prisma: PrismaClient,
	orgId: string,
	envId: string
): Promise<ActivityHeatmapData> {
	try {
		const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

		const [cycleRows, runRows] = await Promise.all([
			prisma.$queryRaw<Array<{ d: Date; cnt: bigint }>>`
				SELECT date_trunc('day', "completedAt")::date AS d, COUNT(*)::bigint AS cnt
				FROM "AuditCycle"
				WHERE "environmentId" = ${envId}
					AND "completedAt" IS NOT NULL
					AND "completedAt" >= ${ninetyDaysAgo}
				GROUP BY 1
			`,
			prisma.$queryRaw<Array<{ d: Date; cnt: bigint }>>`
				SELECT date_trunc('day', "completedAt")::date AS d, COUNT(*)::bigint AS cnt
				FROM "PlaybookRun"
				WHERE "orgId" = ${orgId}
					AND "completedAt" IS NOT NULL
					AND "completedAt" >= ${ninetyDaysAgo}
				GROUP BY 1
			`,
		]);

		const days = buildEmptyHeatmap();
		const byDate = new Map<string, ActivityHeatmapDay>();
		for (const day of days) byDate.set(day.date, day);

		for (const row of cycleRows) {
			const key = isoDay(row.d);
			const day = byDate.get(key);
			if (day) day.cycles = Number(row.cnt);
		}
		for (const row of runRows) {
			const key = isoDay(row.d);
			const day = byDate.get(key);
			if (day) day.actionsResolved = Number(row.cnt);
		}
		for (const day of days) {
			day.count = day.cycles + day.actionsResolved;
		}

		// Streak: walk backwards from today, count consecutive non-zero days.
		let currentStreak = 0;
		for (let i = days.length - 1; i >= 0; i--) {
			if (days[i].count > 0) currentStreak++;
			else break;
		}

		const result: ActivityHeatmapData = { days, currentStreak, caption: "" };
		result.caption = captionForActivityHeatmap(result);
		return result;
	} catch (err) {
		console.warn("[dashboard/aggregator] activity_heatmap failed:", err);
		const fallback: ActivityHeatmapData = {
			days: buildEmptyHeatmap(),
			currentStreak: 0,
			caption: "",
		};
		fallback.caption = captionForActivityHeatmap(fallback);
		return fallback;
	}
}

// ──────────────────────────────────────────────
// Empty payload — honest zero-state for real orgs that have no
// environment or no completed cycles yet. Mirrors the DashboardData
// shape so widgets render their proper empty/zero appearance instead
// of mock numbers (which would mislead a paying customer).
// ──────────────────────────────────────────────
export function emptyDashboardData(): DashboardData {
	const today = new Date();
	const days: ActivityHeatmapDay[] = [];
	for (let i = 89; i >= 0; i--) {
		const d = new Date(today);
		d.setUTCHours(0, 0, 0, 0);
		d.setUTCDate(d.getUTCDate() - i);
		days.push({
			date: d.toISOString().slice(0, 10),
			count: 0,
			cycles: 0,
			actionsResolved: 0,
		});
	}
	const moneyRecovered: MoneyRecoveredData = {
		totalCents: 0,
		confirmedCents: 0,
		claimedCents: 0,
		last7dCents: 0,
		last30dCents: 0,
		currency: DEFAULT_CURRENCY,
		lastUpdatedAt: today.toISOString(),
		caption: "",
	};
	moneyRecovered.caption = captionForMoneyRecovered(moneyRecovered);

	const healthScore: HealthScoreData = {
		current: 0,
		deltaVsLastCycle: 0,
		trend30d: Array(30).fill(0),
		components: { structural: 0, actionQuality: 0, verification: 0 },
		caption: "",
	};
	healthScore.caption = captionForHealthScore(healthScore);

	const exposure: ExposureData = {
		monthlyCents: 0,
		deltaVsLastCycleCents: 0,
		currency: DEFAULT_CURRENCY,
		byPack: [],
		criticalOpenCount: 0,
		criticalDeltaVsLastCycle: 0,
		criticalOpenItems: [],
		caption: "",
	};
	exposure.caption = captionForExposure(exposure);

	const changeReport: ChangeReportData = {
		newFindings: [],
		regressions: [],
		resolved: [],
		verificationsConfirmed: 0,
		caption: "",
	};
	changeReport.caption = captionForChangeReport(changeReport);

	const activityHeatmap: ActivityHeatmapData = {
		days,
		currentStreak: 0,
		caption: "",
	};
	activityHeatmap.caption = captionForActivityHeatmap(activityHeatmap);

	return {
		moneyRecovered,
		healthScore,
		exposure,
		changeReport,
		activityHeatmap,
		adSpend: { totalMonthly: 0, currency: "USD", byPlatform: [], hasData: false, caption: "" },
		crossSignal: { chains: [], totalChains: 0, totalImpactCents: 0, caption: "" },
	};
}

// ──────────────────────────────────────────────
// Top-level orchestrator
// ──────────────────────────────────────────────
// ── Ad Spend KPI ───────────────────────────────
// Reads IntegrationConnection status for meta_ads + google_ads.
// CommerceContext (which carries ad_spend_30d) is ephemeral — computed
// in-memory during the audit cycle and not persisted to DB. So the
// widget shows connection status + last sync timestamp per platform.
// Actual spend amounts surface in the Revenue workspace via compound
// findings (ad_creative_dead_destination, etc.) where numeric_value
// carries the spend.

const PLATFORM_LABELS: Record<string, string> = {
	meta_ads: "Meta Ads",
	google_ads: "Google Ads",
};

async function computeAdSpend(
	prisma: PrismaClient,
	envId: string,
): Promise<AdSpendData> {
	try {
		const connections = await prisma.integrationConnection.findMany({
			where: {
				environmentId: envId,
				provider: { in: ["meta_ads", "google_ads"] },
			},
			select: { provider: true, status: true, lastSyncedAt: true, syncError: true, syncMetadata: true },
		});

		if (connections.length === 0) {
			return { totalMonthly: 0, currency: "USD", byPlatform: [], hasData: false, caption: "" };
		}

		const connected = connections.filter((c) => c.status === "connected");

		// Read cached spend from syncMetadata (written by run-cycle after each poll)
		let totalSpend = 0;
		let currency = "USD";
		const byPlatform: AdSpendData["byPlatform"] = [];

		for (const c of connections) {
			let meta: { ad_spend_30d?: number; currency?: string } = {};
			try {
				if (c.syncMetadata) meta = JSON.parse(c.syncMetadata);
			} catch { /* corrupt metadata — skip */ }

			const spend = meta.ad_spend_30d ?? 0;
			totalSpend += spend;
			if (meta.currency) currency = meta.currency;

			byPlatform.push({
				platform: c.provider,
				label: PLATFORM_LABELS[c.provider] || c.provider,
				spend,
			});
		}

		byPlatform.sort((a, b) => b.spend - a.spend);

		const syncedAt = connected
			.filter((c) => c.lastSyncedAt)
			.map((c) => c.lastSyncedAt!.toISOString())
			.sort()
			.pop();

		let caption = "";
		if (connected.length === 0) {
			const errored = connections.filter((c) => c.status === "error");
			caption = errored.length > 0
				? `${errored.map((c) => PLATFORM_LABELS[c.provider]).join(" + ")} — sync error. Check Data Sources.`
				: "Pending connection. Complete setup in Data Sources.";
		} else if (totalSpend > 0 && byPlatform.length > 1) {
			const top = byPlatform[0];
			const pct = Math.round((top.spend / totalSpend) * 100);
			caption = `${top.label} leads with $${top.spend.toLocaleString()}/mo (${pct}% of total).`;
		} else if (totalSpend > 0) {
			caption = `All spend on ${byPlatform[0]?.label ?? "one platform"}.`;
		} else if (!syncedAt) {
			caption = `${connected.map((c) => PLATFORM_LABELS[c.provider]).join(" + ")} connected — awaiting first audit cycle.`;
		} else {
			const ago = Math.round((Date.now() - new Date(syncedAt).getTime()) / 3600000);
			const agoLabel = ago < 1 ? "< 1h ago" : ago < 24 ? `${ago}h ago` : `${Math.round(ago / 24)}d ago`;
			caption = `Synced ${agoLabel}. No spend data in latest cycle.`;
		}

		return {
			totalMonthly: totalSpend,
			currency,
			byPlatform,
			hasData: connected.length > 0,
			caption,
		};
	} catch {
		return { totalMonthly: 0, currency: "USD", byPlatform: [], hasData: false, caption: "" };
	}
}

// ──────────────────────────────────────────────
// Slice 7 — Cross-Signal Chains
//
// Finds findings that share the same surface URL but come from
// different packs. This reveals causal chains like:
//   [Security] CSP missing → [Trust] Buyer hesitation → [Revenue] Conversion drop
// The detection is pure SQL grouping — no LLM cost.
// ──────────────────────────────────────────────
// ── Cross-signal chain builder (shared core) ──

interface CrossSignalFindingRow {
	id: string;
	severity: string | null;
	pack: string | null;
	surface: string | null;
	impactMidpoint: number | null;
	projection: string | null;
	createdAt: Date;
	cycleId: string | null;
}

function buildCrossSignalChains(findings: CrossSignalFindingRow[]): CrossSignalChain[] {
	const bySurface = new Map<string, CrossSignalFindingRow[]>();
	for (const f of findings) {
		if (!f.surface) continue;
		const group = bySurface.get(f.surface) || [];
		group.push(f);
		bySurface.set(f.surface, group);
	}

	const chains: CrossSignalChain[] = [];
	for (const [surface, group] of bySurface) {
		const packs = new Set(group.map((f) => f.pack).filter(Boolean));
		if (packs.size < 2) continue;

		const links = group.map((f) => {
			let title = "Untitled";
			try {
				const proj = JSON.parse(f.projection || "{}");
				title = proj.title || title;
			} catch { /* ignore */ }
			return {
				pack: f.pack || "unknown",
				title,
				severity: f.severity || "medium",
				impactCents: dollarsToCents(f.impactMidpoint || 0),
				findingId: f.id,
				firstSeenAt: f.createdAt ? f.createdAt.toISOString() : null,
			};
		});

		// Temporal pattern detection: compare cycleIds across packs
		const cyclesByPack = new Map<string, Set<string>>();
		for (const f of group) {
			if (!f.pack || !f.cycleId) continue;
			const cycles = cyclesByPack.get(f.pack) || new Set();
			cycles.add(f.cycleId);
			cyclesByPack.set(f.pack, cycles);
		}
		let temporalPattern: 'sequential' | 'simultaneous' | null = null;
		if (cyclesByPack.size >= 2) {
			// Get the earliest cycleId per pack (lexicographic — UUIDs are time-sortable with CUID)
			const earliestCyclePerPack = [...cyclesByPack.entries()].map(
				([, cycles]) => [...cycles].sort()[0],
			);
			const allSameCycle = earliestCyclePerPack.every((c) => c === earliestCyclePerPack[0]);
			temporalPattern = allSameCycle ? 'simultaneous' : 'sequential';
		}

		const totalImpactCents = links.reduce((sum, l) => sum + l.impactCents, 0);
		const dates = group.map((f) => f.createdAt).filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
		const firstDetectedAt = dates.length > 0 ? dates[0].toISOString() : null;

		const chain: CrossSignalChain = {
			surface,
			links,
			totalImpactCents,
			temporalPattern,
			narrative: "", // filled by narrative generator
			firstDetectedAt,
		};

		// Generate narrative inline (avoid circular import)
		const sorted = [...links].sort((a, b) => {
			const PRIORITY: Record<string, number> = { security_posture: 0, scale_readiness: 1, trust_gap: 2, chargeback: 3, chargeback_resilience: 3, behavioral: 4, friction_tax: 5, first_impression: 6, revenue_integrity: 7, revenue: 7 };
			return (PRIORITY[a.pack] ?? 50) - (PRIORITY[b.pack] ?? 50);
		});
		const impact = totalImpactCents >= 100_000 ? `$${(totalImpactCents / 100_00).toFixed(1)}k` : `$${Math.round(totalImpactCents / 100)}`;
		const LABELS: Record<string, string> = { security_posture: "Security", scale_readiness: "Scale", trust_gap: "Trust", chargeback_resilience: "Chargeback", chargeback: "Chargeback", behavioral: "Behavioral", friction_tax: "Friction", first_impression: "First Impression", revenue_integrity: "Revenue", revenue: "Revenue" };
		const label = (p: string) => LABELS[p] ?? p.replace(/_/g, " ");
		if (sorted.length === 2) {
			chain.narrative = `Your ${surface} has a cross-domain issue: ${sorted[0].title} (${label(sorted[0].pack)}) contributes to ${sorted[1].title} (${label(sorted[1].pack)}), with ~${impact}/mo at risk.`;
		} else {
			chain.narrative = `Your ${surface} has ${sorted.length} cross-domain issues: ${sorted.map((l) => `${l.title} (${label(l.pack)})`).join(", ")}, leading to ~${impact}/mo in combined exposure.`;
		}
		if (temporalPattern === 'sequential' && sorted.length >= 2) {
			chain.narrative += ` Cause-effect chain — ${label(sorted[0].pack)} findings preceded ${label(sorted[sorted.length - 1].pack)}.`;
		}

		chains.push(chain);
	}

	chains.sort((a, b) => b.totalImpactCents - a.totalImpactCents);
	return chains;
}

const CROSS_SIGNAL_SELECT = {
	id: true,
	severity: true,
	pack: true,
	surface: true,
	impactMidpoint: true,
	projection: true,
	createdAt: true,
	cycleId: true,
} as const;

const CROSS_SIGNAL_WHERE = (envId: string) => ({
	environmentId: envId,
	polarity: { not: "positive" as const },
	changeClass: { not: "resolved" as const },
	NOT: { surface: "" },
});

async function computeCrossSignal(
	prisma: PrismaClient,
	envId: string
): Promise<CrossSignalData> {
	try {
		const findings = await prisma.finding.findMany({
			where: CROSS_SIGNAL_WHERE(envId),
			select: CROSS_SIGNAL_SELECT,
		});

		const allChains = buildCrossSignalChains(findings);
		const topChains = allChains.slice(0, 5);
		const totalImpactCents = topChains.reduce((sum, c) => sum + c.totalImpactCents, 0);
		const allChainsImpactCents = allChains.reduce((sum, c) => sum + c.totalImpactCents, 0);

		return {
			chains: topChains,
			allChains: [],  // empty on dashboard (populated by dedicated endpoint)
			totalChains: allChains.length,
			totalImpactCents,
			allChainsImpactCents,
			caption: allChains.length > 0
				? `${allChains.length} cross-domain pattern${allChains.length > 1 ? "s" : ""} detected across your site`
				: "No cross-domain patterns detected yet",
		};
	} catch {
		return { chains: [], allChains: [], totalChains: 0, totalImpactCents: 0, allChainsImpactCents: 0, caption: "" };
	}
}

/**
 * Compute ALL cross-signal chains (not capped at 5).
 * Used by the dedicated /api/cross-signals endpoint.
 */
export async function computeAllCrossSignals(
	prisma: PrismaClient,
	envId: string,
): Promise<CrossSignalChain[]> {
	const findings = await prisma.finding.findMany({
		where: CROSS_SIGNAL_WHERE(envId),
		select: CROSS_SIGNAL_SELECT,
	});
	return buildCrossSignalChains(findings).slice(0, 50);
}

export async function computeDashboardData(
	prisma: PrismaClient,
	orgId: string,
	envId: string
): Promise<DashboardData> {
	const [moneyRecovered, healthScore, exposure, changeReport, activityHeatmap, adSpend, crossSignal] =
		await Promise.all([
			computeMoneyRecovered(prisma, envId),
			computeHealthScore(prisma, orgId, envId),
			computeExposure(prisma, envId),
			computeChangeReport(prisma, envId),
			computeActivityHeatmap(prisma, orgId, envId),
			computeAdSpend(prisma, envId),
			computeCrossSignal(prisma, envId),
		]);

	return {
		moneyRecovered,
		healthScore,
		exposure,
		changeReport,
		activityHeatmap,
		adSpend,
		crossSignal,
	};
}
