import { Decision, Signal, Scoping } from '../domain';
import { CycleSnapshot } from './engine';
import { CycleChangeReport } from './types';

// ──────────────────────────────────────────────
// Snapshot Persistence Contract
//
// Formalizes how cycle snapshots are stored, versioned,
// and compared. Makes change detection a default system
// capability rather than an optional feature.
//
// Every recompute produces a snapshot.
// Every comparison uses a well-defined baseline.
// ──────────────────────────────────────────────

/**
 * Minimum viable snapshot — the essential state needed for change detection.
 * Anything beyond this is supplementary metadata.
 */
export interface VersionedSnapshot {
  /** Unique snapshot identifier */
  id: string;
  /** Cycle reference this snapshot belongs to */
  cycle_ref: string;
  /** Workspace scope for this snapshot */
  workspace_ref: string;
  /** Environment scope */
  environment_ref: string;
  /** Schema version for forward compatibility */
  schema_version: number;
  /** When this snapshot was created */
  created_at: Date;
  /** The actual snapshot data */
  snapshot: CycleSnapshot;
  /** Optional metadata for audit/debugging */
  metadata: SnapshotMetadata;
  /** Wave 7.2: Monthly revenue in cents at this cycle (null = no integration) */
  revenue_snapshot_cents?: number | null;
  /** Wave 7.2: Which integration provider supplied the revenue data */
  revenue_source?: string | null;
}

export interface SnapshotMetadata {
  /** Number of decisions in this snapshot */
  decision_count: number;
  /** Number of signals in this snapshot */
  signal_count: number;
  /** Whether this was an incremental or full audit */
  audit_mode: 'full' | 'incremental';
  /** Duration of the recompute that produced this snapshot */
  recompute_duration_ms: number | null;
  /** Hash of the snapshot data for integrity checking */
  content_hash: string | null;
}

/** Current schema version */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Comparison mode determines which baseline to compare against.
 */
export type ComparisonMode =
  | 'last_cycle'     // Compare against the most recent previous snapshot
  | 'baseline'       // Compare against a designated baseline snapshot
  | 'n_cycles_ago';  // Compare against a snapshot N cycles ago

export interface ComparisonRequest {
  mode: ComparisonMode;
  /** For 'n_cycles_ago' mode: how many cycles back */
  cycles_back?: number;
  /** For 'baseline' mode: specific snapshot ID to compare against */
  baseline_id?: string;
}

/**
 * Contract for snapshot persistence.
 * Implementations can be in-memory, database-backed, or file-based.
 */
export interface SnapshotStore {
  /** Save a new snapshot. Returns the snapshot ID. */
  save(snapshot: VersionedSnapshot): string;

  /** Get the most recent snapshot for a workspace/environment. */
  getLatest(workspace_ref: string, environment_ref: string): VersionedSnapshot | null;

  /** Get a specific snapshot by ID. */
  getById(id: string): VersionedSnapshot | null;

  /** Get the baseline snapshot for a workspace/environment. */
  getBaseline(workspace_ref: string, environment_ref: string): VersionedSnapshot | null;

  /** Set a snapshot as the baseline for its workspace/environment. */
  setBaseline(snapshotId: string): void;

  /** Get the Nth most recent snapshot (0 = latest, 1 = previous, etc.). */
  getNthRecent(workspace_ref: string, environment_ref: string, n: number): VersionedSnapshot | null;

  /** List all snapshots for a workspace/environment, newest first. */
  list(workspace_ref: string, environment_ref: string, limit?: number): VersionedSnapshot[];

  /** Prune old snapshots beyond retention policy. Returns count removed. */
  prune(workspace_ref: string, environment_ref: string, retainCount: number): number;
}

/**
 * Select the appropriate comparison snapshot based on the request mode.
 */
export function selectComparisonSnapshot(
  store: SnapshotStore,
  workspace_ref: string,
  environment_ref: string,
  request: ComparisonRequest,
): VersionedSnapshot | null {
  switch (request.mode) {
    case 'last_cycle':
      return store.getLatest(workspace_ref, environment_ref);

    case 'baseline': {
      if (request.baseline_id) {
        return store.getById(request.baseline_id);
      }
      return store.getBaseline(workspace_ref, environment_ref);
    }

    case 'n_cycles_ago': {
      const n = request.cycles_back ?? 1;
      return store.getNthRecent(workspace_ref, environment_ref, n);
    }
  }
}

/**
 * Create a versioned snapshot from a cycle's decisions and signals.
 */
export function createVersionedSnapshot(
  cycle_ref: string,
  workspace_ref: string,
  environment_ref: string,
  decisions: Decision[],
  signals: Signal[],
  auditMode: 'full' | 'incremental' = 'full',
  recomputeDurationMs: number | null = null,
): VersionedSnapshot {
  const now = new Date();
  const id = `snap_${cycle_ref}_${now.getTime()}`;

  return {
    id,
    cycle_ref,
    workspace_ref,
    environment_ref,
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    created_at: now,
    snapshot: {
      cycle_ref,
      decisions,
      signals,
    },
    metadata: {
      decision_count: decisions.length,
      signal_count: signals.length,
      audit_mode: auditMode,
      recompute_duration_ms: recomputeDurationMs,
      content_hash: null, // computed by store implementation if needed
    },
  };
}

// ──────────────────────────────────────────────
// In-Memory Reference Implementation
// ──────────────────────────────────────────────

/**
 * In-memory snapshot store for testing and single-process deployments.
 * Production should use a persistent implementation.
 */
export class InMemorySnapshotStore implements SnapshotStore {
  private snapshots = new Map<string, VersionedSnapshot>();
  private byScope = new Map<string, string[]>(); // scope_key → snapshot IDs (newest first)
  private baselines = new Map<string, string>(); // scope_key → baseline snapshot ID

  private scopeKey(workspace_ref: string, environment_ref: string): string {
    return `${workspace_ref}::${environment_ref}`;
  }

  save(snapshot: VersionedSnapshot): string {
    this.snapshots.set(snapshot.id, snapshot);

    const key = this.scopeKey(snapshot.workspace_ref, snapshot.environment_ref);
    const ids = this.byScope.get(key) || [];
    ids.unshift(snapshot.id); // newest first
    this.byScope.set(key, ids);

    return snapshot.id;
  }

  getLatest(workspace_ref: string, environment_ref: string): VersionedSnapshot | null {
    const key = this.scopeKey(workspace_ref, environment_ref);
    const ids = this.byScope.get(key);
    if (!ids || ids.length === 0) return null;
    return this.snapshots.get(ids[0]) || null;
  }

  getById(id: string): VersionedSnapshot | null {
    return this.snapshots.get(id) || null;
  }

  getBaseline(workspace_ref: string, environment_ref: string): VersionedSnapshot | null {
    const key = this.scopeKey(workspace_ref, environment_ref);
    const baselineId = this.baselines.get(key);
    if (!baselineId) return null;
    return this.snapshots.get(baselineId) || null;
  }

  setBaseline(snapshotId: string): void {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) return;
    const key = this.scopeKey(snap.workspace_ref, snap.environment_ref);
    this.baselines.set(key, snapshotId);
  }

  getNthRecent(workspace_ref: string, environment_ref: string, n: number): VersionedSnapshot | null {
    const key = this.scopeKey(workspace_ref, environment_ref);
    const ids = this.byScope.get(key);
    if (!ids || ids.length <= n) return null;
    return this.snapshots.get(ids[n]) || null;
  }

  list(workspace_ref: string, environment_ref: string, limit = 50): VersionedSnapshot[] {
    const key = this.scopeKey(workspace_ref, environment_ref);
    const ids = this.byScope.get(key) || [];
    return ids
      .slice(0, limit)
      .map(id => this.snapshots.get(id)!)
      .filter(Boolean);
  }

  prune(workspace_ref: string, environment_ref: string, retainCount: number): number {
    const key = this.scopeKey(workspace_ref, environment_ref);
    const ids = this.byScope.get(key);
    if (!ids || ids.length <= retainCount) return 0;

    // Keep baseline even if outside retention window
    const baselineId = this.baselines.get(key);
    const toRemove = ids.slice(retainCount).filter(id => id !== baselineId);

    for (const id of toRemove) {
      this.snapshots.delete(id);
    }

    this.byScope.set(key, ids.slice(0, retainCount));
    return toRemove.length;
  }
}

/**
 * Default retention: keep last 10 snapshots per workspace/environment.
 */
export const DEFAULT_RETENTION_COUNT = 10;
