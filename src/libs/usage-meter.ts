import { prisma } from "./prismaDb";

// ──────────────────────────────────────────────
// Usage meter  (Wave 5 Fase 1B)
//
// Pay-as-you-go foundation. Records per-org consumption that bills/
// quotas/observability tiles will read. Reuses the existing `Usage`
// model (created in Phase 5 for MCP chat counters) by adding new
// `usageType` values — keeps the schema lean and lets a single admin
// query roll up everything an org does.
//
// Recorded meter types:
//   cycles_run       — count of completed audit cycles
//   pages_crawled    — sum of PageInventoryItem rows produced
//   compute_seconds  — sum of cycle wall-clock duration in seconds
//                      (proxy for vCPU-seconds; refined when worker pool
//                      stats land in Fase 3)
//
// Period bucket: YYYY-MM (UTC). Aligns with billing cycles and lets
// the admin metrics endpoint do single GROUP BY queries.
//
// All writes are best-effort: a failure here must NOT roll back the
// audit cycle. We log + swallow so a Postgres hiccup on the meter
// table doesn't poison the audit-runner's success path.
// ──────────────────────────────────────────────

export type CycleUsageMeter =
	| "cycles_run"
	| "pages_crawled"
	| "compute_seconds";

export interface CycleUsageInput {
	organizationId: string;
	cycleId: string;
	pagesCrawled?: number;
	computeSeconds?: number;
}

function currentPeriod(): string {
	return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

/**
 * Record the resource footprint of a completed audit cycle. Three rows
 * are written (one per meter), each independent so a partial failure
 * still records what it can. Aligned to the current UTC YYYY-MM bucket.
 *
 * Idempotency: callers should invoke this exactly once per cycle. The
 * audit-runner's finally{} block is the canonical call site.
 */
export async function recordCycleUsage(
	input: CycleUsageInput,
): Promise<void> {
	const period = currentPeriod();
	const writes: Array<{ type: CycleUsageMeter; amount: number }> = [
		{ type: "cycles_run", amount: 1 },
	];
	if (typeof input.pagesCrawled === "number" && input.pagesCrawled > 0) {
		writes.push({ type: "pages_crawled", amount: input.pagesCrawled });
	}
	if (typeof input.computeSeconds === "number" && input.computeSeconds > 0) {
		writes.push({
			type: "compute_seconds",
			amount: Math.round(input.computeSeconds),
		});
	}

	for (const w of writes) {
		try {
			await prisma.usage.create({
				data: {
					organizationId: input.organizationId,
					usageType: w.type,
					amount: w.amount,
					period,
				},
			});
		} catch (err) {
			console.warn(
				`[usage-meter] failed to record ${w.type} for org=${input.organizationId} cycle=${input.cycleId}:`,
				err,
			);
		}
	}
}

export interface UsageRollup {
	organizationId: string;
	period: string;
	cyclesRun: number;
	pagesCrawled: number;
	computeSeconds: number;
}

/**
 * Single-org rollup for the current (or specified) period. Used by the
 * admin metrics endpoint and (Fase 3) the rate-limit gate at enqueue.
 */
export async function getOrgUsage(
	organizationId: string,
	period?: string,
): Promise<UsageRollup> {
	const p = period || currentPeriod();
	try {
		const rows = await prisma.usage.groupBy({
			by: ["usageType"],
			where: { organizationId, period: p },
			_sum: { amount: true },
		});

		const lookup: Record<string, number> = {};
		for (const r of rows) lookup[r.usageType] = r._sum.amount ?? 0;
		return {
			organizationId,
			period: p,
			cyclesRun: lookup["cycles_run"] ?? 0,
			pagesCrawled: lookup["pages_crawled"] ?? 0,
			computeSeconds: lookup["compute_seconds"] ?? 0,
		};
	} catch (err) {
		console.warn(`[usage-meter] getOrgUsage failed org=${organizationId}:`, err);
		return {
			organizationId,
			period: p,
			cyclesRun: 0,
			pagesCrawled: 0,
			computeSeconds: 0,
		};
	}
}

/**
 * Top N orgs by cycles_run in the current period. Lets the admin
 * metrics tile show "who's burning the most compute" without scanning
 * every org row.
 */
export async function getTopUsageOrgs(
	limit: number = 10,
	period?: string,
): Promise<UsageRollup[]> {
	const p = period || currentPeriod();
	try {
		const rows = await prisma.usage.groupBy({
			by: ["organizationId"],
			where: { usageType: "cycles_run", period: p },
			_sum: { amount: true },
			orderBy: { _sum: { amount: "desc" } },
			take: limit,
		});
		const results: UsageRollup[] = [];
		for (const row of rows) {
			results.push(await getOrgUsage(row.organizationId, p));
		}
		return results;
	} catch (err) {
		console.warn("[usage-meter] getTopUsageOrgs failed:", err);
		return [];
	}
}
