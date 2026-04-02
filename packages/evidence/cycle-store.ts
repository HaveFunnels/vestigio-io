import {
  AuditCycle,
  CycleStatus,
  CycleType,
  FreshnessState,
  CoverageSummary,
} from '../domain';

// ──────────────────────────────────────────────
// Cycle Store — audit cycle management
// ──────────────────────────────────────────────

export class CycleStore {
  private cycles: Map<string, AuditCycle> = new Map();

  create(params: {
    id: string;
    workspace_ref: string;
    environment_ref: string;
    website_ref: string;
    cycle_type: CycleType;
    trigger_source: 'scheduled' | 'manual' | 'webhook' | 'incremental';
  }): AuditCycle {
    const now = new Date();
    const cycle: AuditCycle = {
      ...params,
      status: 'pending',
      started_at: now,
      completed_at: null,
      freshness_state: FreshnessState.Fresh,
      coverage_summary: null,
      created_at: now,
      updated_at: now,
    };
    this.cycles.set(cycle.id, cycle);
    return cycle;
  }

  get(id: string): AuditCycle | undefined {
    return this.cycles.get(id);
  }

  updateStatus(id: string, status: CycleStatus): void {
    const cycle = this.cycles.get(id);
    if (!cycle) throw new Error(`Cycle not found: ${id}`);
    cycle.status = status;
    cycle.updated_at = new Date();
    if (status === 'completed') {
      cycle.completed_at = new Date();
    }
  }

  updateCoverage(id: string, summary: CoverageSummary): void {
    const cycle = this.cycles.get(id);
    if (!cycle) throw new Error(`Cycle not found: ${id}`);
    cycle.coverage_summary = summary;
    cycle.updated_at = new Date();
  }

  getLatest(website_ref: string): AuditCycle | undefined {
    const cycles = Array.from(this.cycles.values())
      .filter((c) => c.website_ref === website_ref)
      .sort((a, b) => b.started_at.getTime() - a.started_at.getTime());
    return cycles[0];
  }
}
