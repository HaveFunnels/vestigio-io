// ──────────────────────────────────────────────
// Audit Lifecycle Manager
//
// Manages the state machine for audit cycles:
// pending → running → complete | failed
//
// Guarantees:
// - every environment has at least 1 cycle after onboarding
// - invalid state transitions are rejected
// - retries create new cycles (never mutate failed)
// ──────────────────────────────────────────────

export type AuditStatus = 'pending' | 'running' | 'complete' | 'failed';
export type AuditCycleType = 'full' | 'incremental' | 'verification';

export interface AuditCycleRecord {
  id: string;
  organizationId: string;
  environmentId: string;
  status: AuditStatus;
  cycleType: AuditCycleType;
  createdAt: Date;
  completedAt: Date | null;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<AuditStatus, AuditStatus[]> = {
  pending: ['running', 'failed'],
  running: ['complete', 'failed'],
  complete: [],    // terminal
  failed: [],      // terminal — retry creates NEW cycle
};

export function isValidTransition(from: AuditStatus, to: AuditStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(from: AuditStatus, to: AuditStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid audit state transition: ${from} → ${to}`);
  }
}

// ──────────────────────────────────────────────
// Audit Store Interface (DB-backed in production)
// ──────────────────────────────────────────────

export interface AuditStore {
  create(orgId: string, envId: string, cycleType: AuditCycleType): Promise<AuditCycleRecord>;
  getById(cycleId: string): Promise<AuditCycleRecord | null>;
  getLatest(envId: string): Promise<AuditCycleRecord | null>;
  getAllForEnv(envId: string): Promise<AuditCycleRecord[]>;
  updateStatus(cycleId: string, status: AuditStatus, completedAt?: Date): Promise<AuditCycleRecord>;
}

// ──────────────────────────────────────────────
// In-Memory Audit Store (tests + engine)
// ──────────────────────────────────────────────

let cycleCounter = 0;
const auditCycles = new Map<string, AuditCycleRecord>();

export class InMemoryAuditStore implements AuditStore {
  async create(orgId: string, envId: string, cycleType: AuditCycleType): Promise<AuditCycleRecord> {
    const id = `cycle_${++cycleCounter}`;
    const record: AuditCycleRecord = {
      id,
      organizationId: orgId,
      environmentId: envId,
      status: 'pending',
      cycleType,
      createdAt: new Date(),
      completedAt: null,
    };
    auditCycles.set(id, record);
    return record;
  }

  async getById(cycleId: string): Promise<AuditCycleRecord | null> {
    return auditCycles.get(cycleId) || null;
  }

  async getLatest(envId: string): Promise<AuditCycleRecord | null> {
    let latest: AuditCycleRecord | null = null;
    for (const c of auditCycles.values()) {
      if (c.environmentId === envId) {
        if (!latest || c.createdAt > latest.createdAt) latest = c;
      }
    }
    return latest;
  }

  async getAllForEnv(envId: string): Promise<AuditCycleRecord[]> {
    return [...auditCycles.values()]
      .filter(c => c.environmentId === envId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateStatus(cycleId: string, status: AuditStatus, completedAt?: Date): Promise<AuditCycleRecord> {
    const cycle = auditCycles.get(cycleId);
    if (!cycle) throw new Error(`Audit cycle ${cycleId} not found`);
    validateTransition(cycle.status, status);
    cycle.status = status;
    if (completedAt) cycle.completedAt = completedAt;
    return cycle;
  }
}

// Singleton
let activeAuditStore: AuditStore = new InMemoryAuditStore();

export function setAuditStore(store: AuditStore): void {
  activeAuditStore = store;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function triggerAudit(
  orgId: string,
  envId: string,
  cycleType: AuditCycleType = 'full',
): Promise<AuditCycleRecord> {
  return activeAuditStore.create(orgId, envId, cycleType);
}

export async function startAudit(cycleId: string): Promise<AuditCycleRecord> {
  return activeAuditStore.updateStatus(cycleId, 'running');
}

export async function completeAudit(cycleId: string): Promise<AuditCycleRecord> {
  return activeAuditStore.updateStatus(cycleId, 'complete', new Date());
}

export async function failAudit(cycleId: string): Promise<AuditCycleRecord> {
  return activeAuditStore.updateStatus(cycleId, 'failed', new Date());
}

export async function retryAudit(
  cycleId: string,
): Promise<AuditCycleRecord> {
  const failed = await activeAuditStore.getById(cycleId);
  if (!failed) throw new Error(`Audit cycle ${cycleId} not found`);
  if (failed.status !== 'failed') throw new Error(`Can only retry failed cycles, got: ${failed.status}`);

  // Create a new cycle — never mutate the failed one
  return activeAuditStore.create(failed.organizationId, failed.environmentId, failed.cycleType);
}

export async function getLatestCycle(envId: string): Promise<AuditCycleRecord | null> {
  return activeAuditStore.getLatest(envId);
}

export async function getAuditHistory(envId: string): Promise<AuditCycleRecord[]> {
  return activeAuditStore.getAllForEnv(envId);
}

// ──────────────────────────────────────────────
// Timeout Protection
//
// Audits stuck in "running" are auto-failed
// after a configurable threshold.
// ──────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function failStuckAudits(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<AuditCycleRecord[]> {
  const failed: AuditCycleRecord[] = [];
  const now = Date.now();

  // Get all cycles from all environments (scan the store)
  // In production: query WHERE status = 'running' AND createdAt < threshold
  for (const cycle of auditCycles.values()) {
    if (cycle.status === 'running' && (now - cycle.createdAt.getTime()) > timeoutMs) {
      try {
        const updated = await activeAuditStore.updateStatus(cycle.id, 'failed', new Date());
        failed.push(updated);
      } catch {
        // Already transitioned — skip
      }
    }
  }

  return failed;
}

export function getStuckAudits(timeoutMs: number = DEFAULT_TIMEOUT_MS): AuditCycleRecord[] {
  const now = Date.now();
  const stuck: AuditCycleRecord[] = [];
  for (const cycle of auditCycles.values()) {
    if (cycle.status === 'running' && (now - cycle.createdAt.getTime()) > timeoutMs) {
      stuck.push(cycle);
    }
  }
  return stuck;
}

// Testing helpers
export function resetAuditStore(): void {
  auditCycles.clear();
  cycleCounter = 0;
  activeAuditStore = new InMemoryAuditStore();
}
