import { migrateLegacyVerificationMaturity, type FindingProjection } from "./types";

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

/**
 * Structured result of a saveForCycle() call. Written count + per-row
 * failures so the caller can decide whether to mark the cycle complete,
 * complete-with-warnings, or failed.
 */
export interface SaveForCycleResult {
	/** Number of findings successfully persisted. */
	written: number;
	/** Total findings attempted (== args.findings.length). */
	attempted: number;
	/** Findings that failed to persist, with the inference_key + error text. */
	failed: Array<{ inference_key: string; error: string }>;
}

export class PrismaFindingStore {
	constructor(private prisma: any) {}

	// ── Save ──

	/**
	 * Persist all findings for a single cycle. Upserts by
	 * (cycleId, inferenceKey) so re-runs of the same cycle don't
	 * leave dangling rows.
	 *
	 * Returns a structured {written, attempted, failed[]} result. The
	 * caller is expected to:
	 *
	 *   - Log failed.length > 0 as a LOUD error (monitoring picks up)
	 *   - Treat failed.length === attempted (catastrophic loss) as a
	 *     cycle failure, not a "complete with partial data" — the UI
	 *     would show an empty dashboard which is worse than showing
	 *     "audit failed, retry".
	 *   - Continue with complete when it's a minority failure; the
	 *     next cycle will re-run the full projection anyway.
	 *
	 * Accepts an optional `tx` (Prisma transaction client) so the caller
	 * can group findings save + snapshot save + cycle complete into a
	 * single atomic transaction. When `tx` is passed, no nested
	 * transaction is opened — upserts run on the provided client.
	 */
	async saveForCycle(
		args: {
			cycleId: string;
			environmentId: string;
			cycleRef: string;
			findings: FindingProjection[];
		},
		tx?: any,
	): Promise<SaveForCycleResult> {
		const { cycleId, environmentId, cycleRef, findings } = args;
		const result: SaveForCycleResult = {
			written: 0,
			attempted: findings.length,
			failed: [],
		};
		if (findings.length === 0) return result;

		const client = tx ?? this.prisma;

		// Wave 7.3 — batched INSERT ... ON CONFLICT DO UPDATE replaces the
		// sequential upsert loop (N round-trips) with chunked raw SQL
		// (ceil(N/50) round-trips). For 80 findings this reduces persistence
		// from ~3-5s to <100ms (10-50x improvement).
		//
		// Batch size 50: each row has 14 columns → 50 × 14 = 700 params per
		// statement, well within PostgreSQL's 65535 parameter limit.
		const BATCH_SIZE = 50;

		for (let offset = 0; offset < findings.length; offset += BATCH_SIZE) {
			const batch = findings.slice(offset, offset + BATCH_SIZE);
			const params: unknown[] = [];
			const valueRows: string[] = [];
			const batchKeys: string[] = [];

			for (const f of batch) {
				const baseIdx = params.length;
				batchKeys.push(f.inference_key);
				params.push(
					cycleId,                           // $baseIdx+1
					environmentId,                     // $baseIdx+2
					cycleRef,                          // $baseIdx+3
					f.inference_key,                   // $baseIdx+4
					f.pack,                            // $baseIdx+5
					f.severity,                        // $baseIdx+6
					f.polarity,                        // $baseIdx+7
					f.confidence,                      // $baseIdx+8
					f.impact.monthly_range.min,        // $baseIdx+9
					f.impact.monthly_range.max,        // $baseIdx+10
					f.impact.midpoint,                 // $baseIdx+11
					f.surface || "/",                  // $baseIdx+12
					f.root_cause ?? null,              // $baseIdx+13
					f.change_class ?? null,            // $baseIdx+14
					f.verification_maturity ?? null,   // $baseIdx+15
					JSON.stringify(f),                 // $baseIdx+16
				);
				const placeholders = Array.from({ length: 16 }, (_, i) => `$${baseIdx + i + 1}`);
				valueRows.push(`(gen_random_uuid(), ${placeholders.join(', ')}, NOW())`);
			}

			const sql = `
				INSERT INTO "Finding" (
					"id", "cycleId", "environmentId", "cycleRef", "inferenceKey",
					"pack", "severity", "polarity", "confidence",
					"impactMin", "impactMax", "impactMidpoint",
					"surface", "rootCause", "changeClass", "verificationMaturity",
					"projection", "createdAt"
				)
				VALUES ${valueRows.join(',\n                       ')}
				ON CONFLICT ("cycleId", "inferenceKey") DO UPDATE SET
					"pack"                 = EXCLUDED."pack",
					"severity"             = EXCLUDED."severity",
					"polarity"             = EXCLUDED."polarity",
					"confidence"           = EXCLUDED."confidence",
					"impactMin"            = EXCLUDED."impactMin",
					"impactMax"            = EXCLUDED."impactMax",
					"impactMidpoint"       = EXCLUDED."impactMidpoint",
					"surface"              = EXCLUDED."surface",
					"rootCause"            = EXCLUDED."rootCause",
					"changeClass"          = EXCLUDED."changeClass",
					"verificationMaturity" = EXCLUDED."verificationMaturity",
					"projection"           = EXCLUDED."projection"
			`;

			try {
				await client.$executeRawUnsafe(sql, ...params);
				result.written += batch.length;
			} catch (err) {
				// Batch failed — fall back to individual upserts so a single
				// bad row doesn't poison the entire batch.
				console.error(
					`[prisma-finding-store] batch insert failed (${batch.length} rows), falling back to individual upserts:`,
					err,
				);
				for (let i = 0; i < batch.length; i++) {
					const f = batch[i];
					try {
						await client.finding.upsert({
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
						result.written++;
					} catch (fallbackErr) {
						const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
						result.failed.push({ inference_key: f.inference_key, error: msg });
						console.error(
							`[prisma-finding-store] upsert failed for ${f.inference_key}:`,
							fallbackErr,
						);
					}
				}
			}
		}
		return result;
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
		// AND whose parent AuditCycle is `status=complete`. The status
		// filter is defense-in-depth: the audit runner now writes
		// findings + snapshot + cycle.status in a single transaction, so
		// partial landings shouldn't exist — but a cycle that was later
		// marked `failed` (e.g. by healStuckCycles after a crash) must
		// not surface its orphan findings to /api/inventory.
		const latest = await this.prisma.finding.findFirst({
			where: {
				environmentId,
				cycle: { status: "complete" },
			},
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
				const parsed = JSON.parse(row.projection) as FindingProjection;
				// Wave 2.4: translate legacy verification_maturity strings on
				// load so projections persisted before the rename still render
				// with the new vocabulary. Inferences re-emitted on the next
				// audit cycle will overwrite the row with the new format.
				parsed.verification_maturity = migrateLegacyVerificationMaturity(
					parsed.verification_maturity as string | null,
				);
				// Phase 1.1: default remediation_steps + estimated_effort_hours
				// to null for projections persisted before the fields existed.
				// Next cycle re-projection overwrites with real values if
				// Phase 2 has backfilled the GlobalAction template.
				if (parsed.remediation_steps === undefined) {
					parsed.remediation_steps = null;
				}
				if (parsed.estimated_effort_hours === undefined) {
					parsed.estimated_effort_hours = null;
				}
				// Phase 1.2: default impact.role to 'loss' for legacy
				// projections. Positive findings written after Phase 1.2
				// carry role='retention' explicitly; everything older was
				// loss-modeled because retention wasn't a concept yet.
				if (parsed.impact && (parsed.impact as any).role === undefined) {
					(parsed.impact as any).role = 'loss';
				}
				// Phase 1.5: default verification metadata to null for
				// projections written before the fields existed. Phase 2.5
				// backfill will populate them on next cycle; until then the
				// UI / MCP treat null as "not yet classified" and fall back
				// to the legacy generic verify flow.
				if (parsed.verification_strategy === undefined) {
					parsed.verification_strategy = null;
				}
				if (parsed.verification_notes === undefined) {
					parsed.verification_notes = null;
				}
				if (parsed.verification_eta_seconds === undefined) {
					parsed.verification_eta_seconds = null;
				}
				findings.push(parsed);
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

		// Same status=complete filter as loadLatestForEnvironment —
		// inventory counts must not reflect findings from a cycle that
		// was later healed to `failed`.
		const latest = await this.prisma.finding.findFirst({
			where: {
				environmentId,
				cycle: { status: "complete" },
			},
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
