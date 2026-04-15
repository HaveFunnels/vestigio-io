import {
	type VersionedSnapshot,
	type SnapshotMetadata,
	SNAPSHOT_SCHEMA_VERSION,
	DEFAULT_RETENTION_COUNT,
} from "./snapshot-store";
import type { CycleSnapshot } from "./engine";

// ──────────────────────────────────────────────
// PrismaSnapshotStore — DB-backed snapshot persistence
//
// Persists `decisions[]` + `signals[]` snapshots into the CycleSnapshot
// table. This is what makes change detection survive process restarts:
// every cycle saves its snapshot here, and the next cycle reads the
// most recent one to feed `previous_snapshot` into recomputeAll().
//
// Async-only by design. The legacy SnapshotStore interface has sync
// methods (save/getLatest/prune/etc) that are fine for InMemory use
// but can't honestly be implemented over Prisma — a sync method that
// fires-and-forgets a DB write is just a silent data-loss source.
//
// Deliberately does NOT `implements SnapshotStore`. Callers that still
// think they have a sync store (e.g. selectComparisonSnapshot) will
// fail to compile when given a PrismaSnapshotStore, which is the
// intended behavior — they must await the async variants explicitly.
//
// Accepts an optional Prisma transaction client in each write method
// so a caller can group snapshot save + finding save + cycle mark
// complete into a single atomic transaction (see apps/audit-runner).
// ──────────────────────────────────────────────

type PrismaLike = any;

export class PrismaSnapshotStore {
	constructor(private prisma: PrismaLike) {}

	// ── Writes ──

	/**
	 * Persist a snapshot. Awaits the DB write so callers can reason
	 * about durability. Pass `tx` to run inside an existing transaction
	 * (e.g. the audit-runner's finish-cycle transaction).
	 */
	async asyncSave(
		snapshot: VersionedSnapshot,
		cycleId?: string,
		tx?: PrismaLike,
	): Promise<string> {
		const client = tx ?? this.prisma;
		await client.cycleSnapshot.create({
			data: {
				cycleRef: snapshot.cycle_ref,
				cycleId: cycleId || null,
				workspaceRef: snapshot.workspace_ref,
				environmentRef: snapshot.environment_ref,
				schemaVersion: snapshot.schema_version,
				snapshot: JSON.stringify(snapshot.snapshot),
				decisionCount: snapshot.metadata.decision_count,
				signalCount: snapshot.metadata.signal_count,
				auditMode: snapshot.metadata.audit_mode,
				recomputeMs: snapshot.metadata.recompute_duration_ms,
				contentHash: snapshot.metadata.content_hash,
				createdAt: snapshot.created_at,
			},
		});
		return snapshot.id;
	}

	/**
	 * Promote a snapshot to baseline for its workspace/environment.
	 * Clears any existing baseline atomically.
	 */
	async asyncSetBaseline(snapshotId: string, tx?: PrismaLike): Promise<void> {
		const client = tx ?? this.prisma;
		const row = await client.cycleSnapshot.findUnique({
			where: { id: snapshotId },
		});
		if (!row) return;

		if (tx) {
			// Already inside a transaction — do both updates on the same
			// tx client, no nested $transaction.
			await tx.cycleSnapshot.updateMany({
				where: {
					workspaceRef: row.workspaceRef,
					environmentRef: row.environmentRef,
					isBaseline: true,
				},
				data: { isBaseline: false },
			});
			await tx.cycleSnapshot.update({
				where: { id: snapshotId },
				data: { isBaseline: true },
			});
			return;
		}

		await this.prisma.$transaction([
			this.prisma.cycleSnapshot.updateMany({
				where: {
					workspaceRef: row.workspaceRef,
					environmentRef: row.environmentRef,
					isBaseline: true,
				},
				data: { isBaseline: false },
			}),
			this.prisma.cycleSnapshot.update({
				where: { id: snapshotId },
				data: { isBaseline: true },
			}),
		]);
	}

	// ── Reads ──

	async asyncGetLatest(
		workspaceRef: string,
		environmentRef: string,
	): Promise<VersionedSnapshot | null> {
		const row = await this.prisma.cycleSnapshot.findFirst({
			where: { workspaceRef, environmentRef },
			orderBy: { createdAt: "desc" },
		});
		return row ? this.rowToVersioned(row) : null;
	}

	async asyncGetById(id: string): Promise<VersionedSnapshot | null> {
		const row = await this.prisma.cycleSnapshot.findUnique({ where: { id } });
		return row ? this.rowToVersioned(row) : null;
	}

	async asyncGetBaseline(
		workspaceRef: string,
		environmentRef: string,
	): Promise<VersionedSnapshot | null> {
		const row = await this.prisma.cycleSnapshot.findFirst({
			where: { workspaceRef, environmentRef, isBaseline: true },
			orderBy: { createdAt: "desc" },
		});
		return row ? this.rowToVersioned(row) : null;
	}

	async asyncGetNthRecent(
		workspaceRef: string,
		environmentRef: string,
		n: number,
	): Promise<VersionedSnapshot | null> {
		const row = await this.prisma.cycleSnapshot.findFirst({
			where: { workspaceRef, environmentRef },
			orderBy: { createdAt: "desc" },
			skip: n,
		});
		return row ? this.rowToVersioned(row) : null;
	}

	async asyncList(
		workspaceRef: string,
		environmentRef: string,
		limit = 50,
	): Promise<VersionedSnapshot[]> {
		const rows = await this.prisma.cycleSnapshot.findMany({
			where: { workspaceRef, environmentRef },
			orderBy: { createdAt: "desc" },
			take: limit,
		});
		return rows.map((r: any) => this.rowToVersioned(r));
	}

	// ── Pruning ──

	async asyncPrune(
		workspaceRef: string,
		environmentRef: string,
		retainCount: number = DEFAULT_RETENTION_COUNT,
	): Promise<number> {
		// Find IDs to delete: everything beyond retainCount, EXCEPT baselines.
		const all = await this.prisma.cycleSnapshot.findMany({
			where: { workspaceRef, environmentRef, isBaseline: false },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		const toDelete = all.slice(retainCount).map((r: any) => r.id);
		if (toDelete.length === 0) return 0;
		const result = await this.prisma.cycleSnapshot.deleteMany({
			where: { id: { in: toDelete } },
		});
		return result.count;
	}

	// ── Internal: row → VersionedSnapshot ──

	private rowToVersioned(row: any): VersionedSnapshot {
		let snapshot: CycleSnapshot;
		try {
			snapshot = JSON.parse(row.snapshot);
		} catch (err) {
			console.error(
				`[prisma-snapshot-store] failed to parse snapshot row ${row.id}:`,
				err,
			);
			snapshot = { cycle_ref: row.cycleRef, decisions: [], signals: [] };
		}

		const metadata: SnapshotMetadata = {
			decision_count: row.decisionCount,
			signal_count: row.signalCount,
			audit_mode: row.auditMode as "full" | "incremental",
			recompute_duration_ms: row.recomputeMs,
			content_hash: row.contentHash,
		};

		return {
			id: row.id,
			cycle_ref: row.cycleRef,
			workspace_ref: row.workspaceRef,
			environment_ref: row.environmentRef,
			schema_version: row.schemaVersion ?? SNAPSHOT_SCHEMA_VERSION,
			created_at: row.createdAt,
			snapshot,
			metadata,
		};
	}
}
