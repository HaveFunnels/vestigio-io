import {
	type SnapshotStore,
	type VersionedSnapshot,
	type SnapshotMetadata,
	SNAPSHOT_SCHEMA_VERSION,
	DEFAULT_RETENTION_COUNT,
} from "./snapshot-store";
import type { CycleSnapshot } from "./engine";

// ──────────────────────────────────────────────
// PrismaSnapshotStore — DB-backed SnapshotStore
//
// Implements the SnapshotStore interface from snapshot-store.ts using
// Prisma to persist `decisions[]` and `signals[]` JSON blobs into the
// CycleSnapshot table. This is what makes change detection survive
// process restarts: every cycle saves its snapshot here, and the next
// cycle reads the most recent one to feed `previous_snapshot` into
// recomputeAll().
//
// Note: SnapshotStore.save / setBaseline are synchronous in the
// interface (legacy in-memory contract) but Prisma calls are async.
// This adapter uses fire-and-forget for save/setBaseline and the
// asyncSave/asyncSetBaseline alternatives for callers that need to
// await the write. The audit-runner always uses the async variants
// to guarantee durability before marking the cycle complete.
// ──────────────────────────────────────────────

export class PrismaSnapshotStore implements SnapshotStore {
	constructor(private prisma: any) {}

	private scopeKey(workspaceRef: string, environmentRef: string): string {
		return `${workspaceRef}::${environmentRef}`;
	}

	// ── Save (async preferred) ──

	async asyncSave(snapshot: VersionedSnapshot, cycleId?: string): Promise<string> {
		await this.prisma.cycleSnapshot.create({
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

	save(snapshot: VersionedSnapshot): string {
		// Sync interface — fire and forget. Callers that need durability
		// must use asyncSave() instead.
		this.asyncSave(snapshot).catch((err) => {
			console.error("[prisma-snapshot-store] async save failed:", err);
		});
		return snapshot.id;
	}

	// ── Lookups ──

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

	getLatest(_workspaceRef: string, _environmentRef: string): VersionedSnapshot | null {
		// Legacy sync interface — not supported in DB store. Callers
		// should migrate to asyncGetLatest().
		throw new Error(
			"PrismaSnapshotStore.getLatest is not implemented (sync). Use asyncGetLatest().",
		);
	}

	async asyncGetById(id: string): Promise<VersionedSnapshot | null> {
		// In the DB representation, the cuid `id` column is the row id.
		// VersionedSnapshot.id from in-memory store has the form
		// `snap_${cycleRef}_${ts}` — these don't collide because callers
		// only ever pass back ids returned by save() (which we override).
		const row = await this.prisma.cycleSnapshot.findUnique({ where: { id } });
		return row ? this.rowToVersioned(row) : null;
	}

	getById(_id: string): VersionedSnapshot | null {
		throw new Error(
			"PrismaSnapshotStore.getById is not implemented (sync). Use asyncGetById().",
		);
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

	getBaseline(_workspaceRef: string, _environmentRef: string): VersionedSnapshot | null {
		throw new Error(
			"PrismaSnapshotStore.getBaseline is not implemented (sync). Use asyncGetBaseline().",
		);
	}

	async asyncSetBaseline(snapshotId: string): Promise<void> {
		const row = await this.prisma.cycleSnapshot.findUnique({
			where: { id: snapshotId },
		});
		if (!row) return;
		// Clear any existing baseline for the same scope, then set this one.
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

	setBaseline(snapshotId: string): void {
		this.asyncSetBaseline(snapshotId).catch((err) => {
			console.error("[prisma-snapshot-store] setBaseline failed:", err);
		});
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

	getNthRecent(
		_workspaceRef: string,
		_environmentRef: string,
		_n: number,
	): VersionedSnapshot | null {
		throw new Error(
			"PrismaSnapshotStore.getNthRecent is not implemented (sync). Use asyncGetNthRecent().",
		);
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

	list(_workspaceRef: string, _environmentRef: string, _limit?: number): VersionedSnapshot[] {
		throw new Error(
			"PrismaSnapshotStore.list is not implemented (sync). Use asyncList().",
		);
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

	prune(_workspaceRef: string, _environmentRef: string, _retainCount: number): number {
		throw new Error(
			"PrismaSnapshotStore.prune is not implemented (sync). Use asyncPrune().",
		);
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
