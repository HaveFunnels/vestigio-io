// ──────────────────────────────────────────────
// MCP Observability — HARDENED
//
// Structured logging with correlation IDs.
// In-memory buffer + pluggable log sink.
// ──────────────────────────────────────────────

let correlationCounter = 0;

export function generateCorrelationId(): string {
  return `req_${Date.now()}_${++correlationCounter}`;
}

export interface McpLogEntry {
  request_id: string;
  timestamp: string;
  org_id: string;
  env_id: string;
  tool: string;
  success: boolean;
  execution_ms: number;
  usage_consumed: number;
  error: string | null;
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// Log Sink Interface
// ──────────────────────────────────────────────

export interface LogSink {
  write(entry: McpLogEntry): void;
}

class MemoryLogSink implements LogSink {
  private buffer: McpLogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  write(entry: McpLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) this.buffer.shift();
  }

  getAll(): McpLogEntry[] { return this.buffer; }
  clear(): void { this.buffer.length = 0; }
}

// Active sinks (supports multiple)
const memorySink = new MemoryLogSink();
const additionalSinks: LogSink[] = [];

export function addLogSink(sink: LogSink): void {
  additionalSinks.push(sink);
}

// ──────────────────────────────────────────────
// Logging API
// ──────────────────────────────────────────────

let debugOrgs = new Set<string>();

export function logMcpCall(entry: McpLogEntry): void {
  // Ensure request_id
  if (!entry.request_id) entry.request_id = generateCorrelationId();

  memorySink.write(entry);
  for (const sink of additionalSinks) {
    try { sink.write(entry); } catch { /* sink failure must not break MCP */ }
  }

  if (debugOrgs.has(entry.org_id) || debugOrgs.has('*')) {
    console.log(JSON.stringify({
      level: entry.success ? 'info' : 'error',
      service: 'vestigio-mcp',
      ...entry,
    }));
  }
}

export function createMcpLogger(orgId: string, envId: string) {
  return {
    log(tool: string, startTime: number, success: boolean, error: string | null = null, usageConsumed: number = 1): McpLogEntry {
      const entry: McpLogEntry = {
        request_id: generateCorrelationId(),
        timestamp: new Date().toISOString(),
        org_id: orgId,
        env_id: envId,
        tool,
        success,
        execution_ms: Date.now() - startTime,
        usage_consumed: success ? usageConsumed : 0,
        error,
      };
      logMcpCall(entry);
      return entry;
    },
  };
}

// ──────────────────────────────────────────────
// Query API
// ──────────────────────────────────────────────

export function getRecentLogs(limit: number = 50): McpLogEntry[] {
  return memorySink.getAll().slice(-limit).reverse();
}

export function getLogsByOrg(orgId: string, limit: number = 50): McpLogEntry[] {
  return memorySink.getAll().filter(e => e.org_id === orgId).slice(-limit).reverse();
}

export function getErrorLogs(limit: number = 50): McpLogEntry[] {
  return memorySink.getAll().filter(e => !e.success).slice(-limit).reverse();
}

export function getLogsByRequestId(requestId: string): McpLogEntry[] {
  return memorySink.getAll().filter(e => e.request_id === requestId);
}

export function getLogStats(): {
  total_calls: number;
  errors: number;
  error_rate: number;
  avg_execution_ms: number;
  calls_today: number;
  p95_execution_ms: number;
} {
  const all = memorySink.getAll();
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = all.filter(e => e.timestamp.startsWith(today));
  const totalMs = all.reduce((s, e) => s + e.execution_ms, 0);
  const errors = all.filter(e => !e.success).length;

  // P95 latency
  const sorted = [...all].sort((a, b) => a.execution_ms - b.execution_ms);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted.length > 0 ? sorted[Math.min(p95Index, sorted.length - 1)].execution_ms : 0;

  return {
    total_calls: all.length,
    errors,
    error_rate: all.length > 0 ? Math.round((errors / all.length) * 10000) / 100 : 0,
    avg_execution_ms: all.length > 0 ? Math.round(totalMs / all.length) : 0,
    calls_today: todayLogs.length,
    p95_execution_ms: p95,
  };
}

// ──────────────────────────────────────────────
// Debug mode
// ──────────────────────────────────────────────

export function enableDebug(orgId: string): void { debugOrgs.add(orgId); }
export function disableDebug(orgId: string): void { debugOrgs.delete(orgId); }
export function enableGlobalDebug(): void { debugOrgs.add('*'); }

export function clearLogs(): void {
  memorySink.clear();
}
