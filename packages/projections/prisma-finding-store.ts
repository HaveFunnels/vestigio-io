import type { FindingProjection } from "./types";

// ──────────────────────────────────────────────
// PrismaFindingStore — DB-backed projection persistence
//
// Persists FindingProjection rows produced by projectAll() so they
// survive process restarts AND can be queried efficiently for things
// like "how many findings touch surface X in env Y" without reloading
// the engine context.
//
// Two main consumers:
//
//   1. apps/audit-runner/run-cycle.ts — calls saveForCycle() at the
//      end of every audit so the next request to /api/inventory or
//      /app/analysis sees real findings without re-running the engine.
//
//   2. /api/inventory — calls countBySurface() to populate
//      finding_count per surface (replaces the null placeholder from
//      Wave 0.5).
//
//   3. src/lib/console-data.ts ensureContext() — calls loadLatest()
//      on cold start to skip the recompute and rehydrate findings
//      directly from DB. Falls back to recompute if no rows exist.
//
// Find rows are scoped per (cycleId, inferenceKey) — uniqueness is
// enforced at the DB level, so re-running an audit on the same cycle
// upserts cleanly.
// ──────────────────────────────────────────────

export class PrismaFindingStore {
	constructor(private prisma: any) {}

	// ── Save ──

	/**
	 * Persist all findings for a single cycle. Upserts by
	 * (cycleId, inferenceKey) so re-runs of the same cycle don't
	 * leave dangling rows.
	 *
	 * Returns the number of findings written.
	 */
	async saveForCycle(args: {
		cycleId: string;
		environmentId: string;
		cycleRef: string;
		findings: FindingProjection[];
	}): Promise<number> {
		const { cycleId, environmentId, cycleRef, findings } = args;
		if (findings.length === 0) return 0;

		// Use individual upserts so partial failure doesn't lose data.
		// Could be optimized to a single createMany + onConflictDoUpdate
		// but Prisma 5 doesn't support upsertMany cleanly across DBs.
		let written = 0;
		for (const f of findings) {
			try {
				await this.prisma.finding.upsert({
					where: {
						cycleId_inferenceKey: { cycleId, inferenceKey: f.inference_key },
					},
					create: {
						cycleId,
						environmentId,
						cycleRef,
						inferenceKey: f.inference_key,
						pack: f.pack,
						severity: f.severity,
						polarity: f.polarity,
						confidence: f.confidence,
						impactMin: f.impact.monthly_range.min,
						impactMax: f.impact.monthly_range.max,
						impactMidpoint: f.impact.midpoint,
						surface: f.surface || "/",
						rootCause: f.root_cause,
						changeClass: f.change_class,
						verificationMaturity: f.verification_maturity,
						projection: JSON.stringify(f),
					},
					update: {
						pack: f.pack,
						severity: f.severity,
						polarity: f.polarity,
						confidence: f.confidence,
						impactMin: f.impact.monthly_range.min,
						impactMax: f.impact.monthly_range.max,
						impactMidpoint: f.impact.midpoint,
						surface: f.surface || "/",
						rootCause: f.root_cause,
						changeClass: f.change_class,
						verificationMaturity: f.verification_maturity,
						projection: JSON.stringify(f),
					},
				});
				written++;
			} catch (err) {
				console.error(
					`[prisma-finding-store] upsert failed for ${f.inference_key}:`,
					err,
				);
			}
		}
		return written;
	}

	// ── Load latest cycle for an environment ──

	/**
	 * Load the FindingProjection rows from the most recent complete
	 * cycle for the given environment. Used by ensureContext() on
	 * cold start to skip the recompute when possible.
	 *
	 * Returns null if there's no complete cycle (caller should fall
	 * back to a fresh recompute).
	 */
	async loadLatestForEnvironment(environmentId: string): Promise<{
		cycleId: string;
		cycleRef: string;
		findings: FindingProjection[];
	} | null> {
		// Find the most recent cycle that has at least one finding row
		// (skips cycles that completed before Wave 0.7 shipped — those
		// have evidence but no findings, and ensureContext should still
		// work for them via the legacy recompute path).
		const latest = await this.prisma.finding.findFirst({
			where: { environmentId },
			orderBy: { createdAt: "desc" },
			select: { cycleId: true, cycleRef: true },
		});
		if (!latest) return null;

		const rows = await this.prisma.finding.findMany({
			where: { cycleId: latest.cycleId },
			orderBy: { impactMidpoint: "desc" },
		});

		const findings: FindingProjection[] = [];
		for (const row of rows) {
			try {
				findings.push(JSON.parse(row.projection));
			} catch (err) {
				console.warn(
					`[prisma-finding-store] failed to parse projection ${row.id}:`,
					err,
				);
			}
		}

		return {
			cycleId: latest.cycleId,
			cycleRef: latest.cycleRef,
			findings,
		};
	}

	// ── Aggregate queries (used by /api/inventory) ──

	/**
	 * Count findings per surface for the most recent complete cycle of
	 * an environment. Used by /api/inventory to populate
	 * finding_count per inventory row.
	 *
	 * Returns a Map<surface, count>. Surfaces with 0 findings are
	 * NOT included — callers should default to 0.
	 */
	async countBySurfaceForLatestCycle(
		environmentId: string,
	): Promise<Map<string, number>> {
		const counts = new Map<string, number>();

		const latest = await this.prisma.finding.findFirst({
			where: { environmentId },
			orderBy: { createdAt: "desc" },
			select: { cycleId: true },
		});
		if (!latest) return counts;

		const grouped = await this.prisma.finding.groupBy({
			by: ["surface"],
			where: {
				cycleId: latest.cycleId,
				// Only count negatives + neutrals as "findings" — positives
				// are reinforcement messages, not problems.
				polarity: { in: ["negative", "neutral"] },
			},
			_count: { _all: true },
		});

		for (const g of grouped) {
			counts.set(g.surface, g._count._all);
		}
		return counts;
	}

	/**
	 * Count findings per surface for a specific cycle (used by admin
	 * tools that want to compare two arbitrary cycles).
	 */
	async countBySurfaceForCycle(cycleId: string): Promise<Map<string, number>> {
		const counts = new Map<string, number>();
		const grouped = await this.prisma.finding.groupBy({
			by: ["surface"],
			where: {
				cycleId,
				polarity: { in: ["negative", "neutral"] },
			},
			_count: { _all: true },
		});
		for (const g of grouped) {
			counts.set(g.surface, g._count._all);
		}
		return counts;
	}

	// ── Pruning ──

	/**
	 * Delete all findings for cycles older than the retention cap.
	 * Cascading FK from AuditCycle deletes findings automatically when
	 * the cycle row is deleted, so this is only needed if you want to
	 * prune findings independently of the cycle.
	 */
	async pruneOlderThan(environmentId: string, keepCount: number): Promise<number> {
		const cycles = await this.prisma.auditCycle.findMany({
			where: { environmentId, status: "complete" },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		const toPrune = cycles.slice(keepCount).map((c: any) => c.id);
		if (toPrune.length === 0) return 0;
		const result = await this.prisma.finding.deleteMany({
			where: { cycleId: { in: toPrune } },
		});
		return result.count;
	}
}
