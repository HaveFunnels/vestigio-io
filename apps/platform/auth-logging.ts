// ──────────────────────────────────────────────
// Structured Auth Logging
//
// Dual-layer: in-memory for fast queries +
// optional Prisma sink for persistence.
//
// Rules:
// - never log passwords or encrypted credentials
// - never log decrypted secrets
// - always include environment_id
// - include correlation_id when available
// ──────────────────────────────────────────────

export interface AuthLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  event: AuthEventType;
  environment_id: string;
  correlation_id: string | null;
  outcome: string | null;
  duration_ms: number | null;
  message: string;
}

export type AuthEventType =
  | 'auth_attempt_started'
  | 'auth_attempt_success'
  | 'auth_attempt_failed'
  | 'auth_mfa_detected'
  | 'auth_prerequisite_blocked'
  | 'auth_runtime_error'
  | 'auth_config_saved'
  | 'auth_config_deleted'
  | 'auth_status_updated';

// ── In-memory buffer ──────────────────────────

const authLogs: AuthLogEntry[] = [];
const MAX_LOGS = 500;

// ── Prisma sink (optional) ────────────────────

let prismaSink: any | null = null;

export function setAuthLogPrisma(prisma: any): void {
  prismaSink = prisma;
}

// ── Core logging ──────────────────────────────

export function logAuthEvent(entry: Omit<AuthLogEntry, 'timestamp'>): void {
  const full: AuthLogEntry = { timestamp: new Date(), ...entry };

  // In-memory (fast reads)
  authLogs.push(full);
  if (authLogs.length > MAX_LOGS) {
    authLogs.splice(0, authLogs.length - MAX_LOGS);
  }

  // Persist to DB (fire-and-forget — non-blocking)
  if (prismaSink) {
    prismaSink.authEvent.create({
      data: {
        environmentId: entry.environment_id,
        correlationId: entry.correlation_id,
        eventType: entry.event,
        level: entry.level,
        outcome: entry.outcome,
        durationMs: entry.duration_ms,
        message: entry.message,
      },
    }).catch(() => { /* swallow DB errors for logging */ });
  }
}

// ── Query APIs ────────────────────────────────

export function getAuthLogs(environmentId?: string): AuthLogEntry[] {
  if (environmentId) {
    return authLogs.filter(l => l.environment_id === environmentId);
  }
  return [...authLogs];
}

export function getAuthLogsByCorrelation(correlationId: string): AuthLogEntry[] {
  return authLogs.filter(l => l.correlation_id === correlationId);
}

export function clearAuthLogs(): void {
  authLogs.length = 0;
}

/**
 * Query persisted auth events from DB.
 * Falls back to in-memory if Prisma not configured.
 */
export async function getPersistedAuthLogs(environmentId: string, limit: number = 50): Promise<AuthLogEntry[]> {
  if (!prismaSink) return getAuthLogs(environmentId);

  const rows = await prismaSink.authEvent.findMany({
    where: { environmentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.map((r: any) => ({
    timestamp: r.createdAt,
    level: r.level,
    event: r.eventType,
    environment_id: r.environmentId,
    correlation_id: r.correlationId,
    outcome: r.outcome,
    duration_ms: r.durationMs,
    message: r.message,
  }));
}

/**
 * Create a scoped logger for a specific auth attempt.
 */
export function createAuthLogger(environmentId: string, correlationId?: string) {
  const corrId = correlationId || `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    correlation_id: corrId,
    info(event: AuthEventType, message: string, durationMs?: number) {
      logAuthEvent({ level: 'info', event, environment_id: environmentId, correlation_id: corrId, outcome: null, duration_ms: durationMs ?? null, message });
    },
    warn(event: AuthEventType, message: string, outcome?: string) {
      logAuthEvent({ level: 'warn', event, environment_id: environmentId, correlation_id: corrId, outcome: outcome ?? null, duration_ms: null, message });
    },
    error(event: AuthEventType, message: string, outcome?: string) {
      logAuthEvent({ level: 'error', event, environment_id: environmentId, correlation_id: corrId, outcome: outcome ?? null, duration_ms: null, message });
    },
    complete(outcome: string, durationMs: number) {
      const event: AuthEventType = outcome === 'authenticated_success' ? 'auth_attempt_success' : 'auth_attempt_failed';
      logAuthEvent({ level: outcome === 'authenticated_success' ? 'info' : 'warn', event, environment_id: environmentId, correlation_id: corrId, outcome, duration_ms: durationMs, message: `Auth attempt completed: ${outcome}` });
    },
  };
}
