// DEPRECATED: This file is superseded by apps/audit-runner/scheduler.ts (Wave 5, Fase 3).
// Kept for reference only. Do not use.
//
// The active scheduler lives at apps/audit-runner/scheduler.ts and uses
// Prisma + the priority queue system. This in-memory scheduler was the
// Phase 1 implementation and is no longer called by any production code.

import { PlanKey, AuditTrigger, AuditType, AuditFrequency, ScheduledAudit } from '../../packages/plans';
import { getPlanLimits } from '../../packages/plans';

// ──────────────────────────────────────────────
// Continuous Audit Scheduler
//
// Plan mapping:
//   Base  — no continuous audit
//   Pro   — daily incremental
//   Max   — event-driven + periodic (every 12h)
//
// Audit types:
//   incremental — reuse graph, validate critical paths only
//   full — full re-analysis (rare, expensive)
//
// Triggers:
//   onboarding_complete — first audit after setup
//   manual_refresh — user-initiated
//   time_based — scheduled by plan
//   mcp_triggered — MCP conversation triggers re-analysis
// ──────────────────────────────────────────────

let idCounter = 0;
function nextAuditId(): string {
  return `audit_${Date.now()}_${++idCounter}`;
}

// In-memory schedule store
const scheduledAudits = new Map<string, ScheduledAudit>();

// Last audit timestamps per environment
const lastAuditMap = new Map<string, Date>();

// ──────────────────────────────────────────────
// Plan → Audit Behavior
// ──────────────────────────────────────────────

interface AuditBehavior {
  enabled: boolean;
  default_type: AuditType;
  interval_hours: number; // 0 = no time-based
  max_per_day: number;
}

const AUDIT_BEHAVIOR: Record<AuditFrequency, AuditBehavior> = {
  none: { enabled: false, default_type: 'incremental', interval_hours: 0, max_per_day: 0 },
  low:  { enabled: true,  default_type: 'incremental', interval_hours: 24, max_per_day: 2 },
  high: { enabled: true,  default_type: 'incremental', interval_hours: 12, max_per_day: 6 },
};

function getAuditBehavior(plan: PlanKey): AuditBehavior {
  const limits = getPlanLimits(plan);
  return AUDIT_BEHAVIOR[limits.audit_frequency];
}

// ──────────────────────────────────────────────
// Schedule an Audit
// ──────────────────────────────────────────────

export interface ScheduleResult {
  scheduled: boolean;
  audit: ScheduledAudit | null;
  reason: string | null;
}

export function scheduleAudit(
  environmentId: string,
  trigger: AuditTrigger,
  plan: PlanKey,
  auditType?: AuditType,
): ScheduleResult {
  const behavior = getAuditBehavior(plan);

  // Onboarding always allowed (first audit)
  if (trigger !== 'onboarding_complete' && trigger !== 'manual_refresh') {
    if (!behavior.enabled) {
      return { scheduled: false, audit: null, reason: 'Continuous audits not available on this plan.' };
    }
  }

  // Check daily limit (except manual)
  if (trigger !== 'manual_refresh' && trigger !== 'onboarding_complete') {
    const todayCount = getTodayAuditCount(environmentId);
    if (todayCount >= behavior.max_per_day) {
      return { scheduled: false, audit: null, reason: `Daily audit limit reached (${behavior.max_per_day}).` };
    }
  }

  // Check interval (time-based only)
  if (trigger === 'time_based') {
    const lastAudit = lastAuditMap.get(environmentId);
    if (lastAudit && behavior.interval_hours > 0) {
      const hoursSince = (Date.now() - lastAudit.getTime()) / (1000 * 60 * 60);
      if (hoursSince < behavior.interval_hours) {
        return {
          scheduled: false,
          audit: null,
          reason: `Too soon. Next audit available in ${Math.ceil(behavior.interval_hours - hoursSince)}h.`,
        };
      }
    }
  }

  const type = auditType || behavior.default_type;
  const audit: ScheduledAudit = {
    id: nextAuditId(),
    environment_id: environmentId,
    trigger,
    audit_type: type,
    scheduled_at: new Date(),
    status: 'pending',
  };

  scheduledAudits.set(audit.id, audit);
  return { scheduled: true, audit, reason: null };
}

// ──────────────────────────────────────────────
// Audit Lifecycle
// ──────────────────────────────────────────────

export function startAudit(auditId: string): boolean {
  const audit = scheduledAudits.get(auditId);
  if (!audit || audit.status !== 'pending') return false;
  audit.status = 'running';
  return true;
}

export function completeAudit(auditId: string): boolean {
  const audit = scheduledAudits.get(auditId);
  if (!audit || audit.status !== 'running') return false;
  audit.status = 'complete';
  lastAuditMap.set(audit.environment_id, new Date());
  return true;
}

export function failAudit(auditId: string): boolean {
  const audit = scheduledAudits.get(auditId);
  if (!audit || audit.status !== 'running') return false;
  audit.status = 'failed';
  return true;
}

// ──────────────────────────────────────────────
// Query
// ──────────────────────────────────────────────

export function getScheduledAudits(environmentId?: string): ScheduledAudit[] {
  const all = Array.from(scheduledAudits.values());
  if (!environmentId) return all;
  return all.filter(a => a.environment_id === environmentId);
}

export function getPendingAudits(environmentId?: string): ScheduledAudit[] {
  return getScheduledAudits(environmentId).filter(a => a.status === 'pending');
}

function getTodayAuditCount(environmentId: string): number {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return getScheduledAudits(environmentId).filter(a => {
    const d = a.scheduled_at;
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return dStr === todayStr;
  }).length;
}

// ──────────────────────────────────────────────
// Check if time-based audit is due
// ──────────────────────────────────────────────

export function isAuditDue(environmentId: string, plan: PlanKey): boolean {
  const behavior = getAuditBehavior(plan);
  if (!behavior.enabled || behavior.interval_hours === 0) return false;

  const lastAudit = lastAuditMap.get(environmentId);
  if (!lastAudit) return true; // never audited

  const hoursSince = (Date.now() - lastAudit.getTime()) / (1000 * 60 * 60);
  return hoursSince >= behavior.interval_hours;
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetScheduler(): void {
  scheduledAudits.clear();
  lastAuditMap.clear();
  idCounter = 0;
}
