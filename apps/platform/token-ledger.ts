// ──────────────────────────────────────────────
// Token Cost Ledger — Persistence Store
//
// Records every Claude API call with model, tokens, cost.
// Provides aggregation queries for admin dashboard.
// ──────────────────────────────────────────────

import type { PrismaClient } from '@prisma/client';
import type { TokenLedgerEntry, LlmModel } from './token-cost';

// ── Aggregation Types ────────────────────────

export interface OrgTokenAggregate {
  organizationId: string;
  period: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  callCount: number;
  byModel: Record<string, { input: number; output: number; cost: number; calls: number }>;
  byPurpose: Record<string, { input: number; output: number; cost: number; calls: number }>;
}

// ── Store Interface ──────────────────────────

export interface TokenLedgerStore {
  record(entry: TokenLedgerEntry): Promise<void>;
  aggregateByOrg(orgId: string, period: string): Promise<OrgTokenAggregate>;
  aggregateAllOrgs(period: string): Promise<OrgTokenAggregate[]>;
}

// ── In-Memory Store (dev/test) ───────────────

export class InMemoryTokenLedgerStore implements TokenLedgerStore {
  private entries: TokenLedgerEntry[] = [];

  async record(entry: TokenLedgerEntry): Promise<void> {
    this.entries.push(entry);
    if (this.entries.length > 50_000) {
      this.entries = this.entries.slice(-50_000);
    }
  }

  async aggregateByOrg(orgId: string, period: string): Promise<OrgTokenAggregate> {
    const filtered = this.entries.filter((e) => e.organizationId === orgId);
    return buildAggregate(orgId, period, filtered);
  }

  async aggregateAllOrgs(period: string): Promise<OrgTokenAggregate[]> {
    const byOrg = new Map<string, TokenLedgerEntry[]>();
    for (const entry of this.entries) {
      const list = byOrg.get(entry.organizationId) || [];
      list.push(entry);
      byOrg.set(entry.organizationId, list);
    }
    return Array.from(byOrg.entries()).map(([orgId, entries]) => buildAggregate(orgId, period, entries));
  }
}

// ── Prisma Store (production) ────────────────

export class PrismaTokenLedgerStore implements TokenLedgerStore {
  constructor(private prisma: PrismaClient) {}

  async record(entry: TokenLedgerEntry): Promise<void> {
    await this.prisma.tokenCostLedger.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        conversationId: entry.conversationId,
        model: entry.model,
        purpose: entry.purpose,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheCreationInputTokens: entry.cacheCreationInputTokens,
        cacheReadInputTokens: entry.cacheReadInputTokens,
        costCents: entry.costCents,
        latencyMs: entry.latencyMs,
        isToolUse: entry.isToolUse,
      },
    });
  }

  async aggregateByOrg(orgId: string, period: string): Promise<OrgTokenAggregate> {
    const { startDate, endDate } = parsePeriod(period);

    const entries = await this.prisma.tokenCostLedger.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: startDate, lt: endDate },
      },
    });

    return buildAggregate(orgId, period, entries.map(toEntry));
  }

  async aggregateAllOrgs(period: string): Promise<OrgTokenAggregate[]> {
    const { startDate, endDate } = parsePeriod(period);

    const entries = await this.prisma.tokenCostLedger.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
    });

    const byOrg = new Map<string, TokenLedgerEntry[]>();
    for (const entry of entries) {
      const mapped = toEntry(entry);
      const list = byOrg.get(mapped.organizationId) || [];
      list.push(mapped);
      byOrg.set(mapped.organizationId, list);
    }

    return Array.from(byOrg.entries()).map(([orgId, e]) => buildAggregate(orgId, period, e));
  }
}

// ── Singleton ────────────────────────────────

let activeStore: TokenLedgerStore = new InMemoryTokenLedgerStore();

export function setTokenLedgerStore(store: TokenLedgerStore): void {
  activeStore = store;
}

export function getTokenLedgerStore(): TokenLedgerStore {
  return activeStore;
}

// ── Helpers ──────────────────────────────────

function buildAggregate(orgId: string, period: string, entries: TokenLedgerEntry[]): OrgTokenAggregate {
  const byModel: Record<string, { input: number; output: number; cost: number; calls: number }> = {};
  const byPurpose: Record<string, { input: number; output: number; cost: number; calls: number }> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;

  for (const e of entries) {
    totalInput += e.inputTokens;
    totalOutput += e.outputTokens;
    totalCost += e.costCents;

    if (!byModel[e.model]) byModel[e.model] = { input: 0, output: 0, cost: 0, calls: 0 };
    byModel[e.model].input += e.inputTokens;
    byModel[e.model].output += e.outputTokens;
    byModel[e.model].cost += e.costCents;
    byModel[e.model].calls += 1;

    if (!byPurpose[e.purpose]) byPurpose[e.purpose] = { input: 0, output: 0, cost: 0, calls: 0 };
    byPurpose[e.purpose].input += e.inputTokens;
    byPurpose[e.purpose].output += e.outputTokens;
    byPurpose[e.purpose].cost += e.costCents;
    byPurpose[e.purpose].calls += 1;
  }

  return {
    organizationId: orgId,
    period,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCostCents: totalCost,
    callCount: entries.length,
    byModel,
    byPurpose,
  };
}

function parsePeriod(period: string): { startDate: Date; endDate: Date } {
  const parts = period.split('-').map(Number);

  if (parts.some(isNaN) || parts.length < 2) {
    throw new Error(`Invalid period format: ${period}`);
  }

  const [year, month, day] = parts;
  if (month < 1 || month > 12) throw new Error(`Invalid month in period: ${period}`);

  // Use UTC to avoid timezone boundary issues
  if (parts.length === 3) {
    if (day < 1 || day > 31) throw new Error(`Invalid day in period: ${period}`);
    const start = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(start.getTime())) throw new Error(`Invalid date: ${period}`);
    const end = new Date(Date.UTC(year, month - 1, day + 1));
    return { startDate: start, endDate: end };
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // First day of next month
  return { startDate: start, endDate: end };
}

function toEntry(row: any): TokenLedgerEntry {
  return {
    organizationId: row.organizationId,
    userId: row.userId,
    conversationId: row.conversationId,
    model: row.model as LlmModel,
    purpose: row.purpose,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheCreationInputTokens: row.cacheCreationInputTokens,
    cacheReadInputTokens: row.cacheReadInputTokens,
    costCents: row.costCents,
    latencyMs: row.latencyMs,
    isToolUse: row.isToolUse,
  };
}
