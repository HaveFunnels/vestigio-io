// ──────────────────────────────────────────────
// Token Cost Calculator
//
// Pure functions for calculating Claude API costs.
// Pricing: per-token in cents.
// ──────────────────────────────────────────────

export type LlmModel = 'haiku_4_5' | 'sonnet_4_6' | 'opus_4_6';

export interface ClaudeUsageReport {
  model: LlmModel;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface TokenLedgerEntry {
  organizationId: string;
  userId: string;
  conversationId: string | null;
  model: LlmModel;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costCents: number;
  latencyMs: number | null;
  isToolUse: boolean;
}

// Pricing per token in cents (derived from $/M token pricing)
// Haiku 4.5:  $0.80/M input, $4.00/M output
// Sonnet 4.6: $3.00/M input, $15.00/M output
// Opus 4.6:   $15.00/M input, $75.00/M output
const PRICING: Record<LlmModel, { input: number; output: number }> = {
  haiku_4_5:  { input: 0.000_080, output: 0.000_400 },
  sonnet_4_6: { input: 0.000_300, output: 0.001_500 },
  opus_4_6:   { input: 0.001_500, output: 0.007_500 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

export function calculateCostCents(report: ClaudeUsageReport): number {
  const pricing = PRICING[report.model];
  if (!pricing) return 0;

  // Use integer arithmetic (multiply by 10000, round, divide) to avoid
  // floating-point accumulation errors across thousands of small charges
  const standardInputCost = Math.round(report.input_tokens * pricing.input * 10000) / 10000;
  const cacheWriteCost = Math.round(report.cache_creation_input_tokens * pricing.input * CACHE_WRITE_MULTIPLIER * 10000) / 10000;
  const cacheReadCost = Math.round(report.cache_read_input_tokens * pricing.input * CACHE_READ_MULTIPLIER * 10000) / 10000;
  const outputCost = Math.round(report.output_tokens * pricing.output * 10000) / 10000;

  // Round final to 4 decimal places (sub-cent precision preserved for aggregation)
  return Math.round((standardInputCost + cacheWriteCost + cacheReadCost + outputCost) * 10000) / 10000;
}

export function createLedgerEntry(
  report: ClaudeUsageReport,
  metadata: {
    organizationId: string;
    userId: string;
    conversationId: string | null;
    purpose: string;
    latencyMs: number | null;
    isToolUse: boolean;
  },
): TokenLedgerEntry {
  return {
    organizationId: metadata.organizationId,
    userId: metadata.userId,
    conversationId: metadata.conversationId,
    model: report.model,
    purpose: metadata.purpose,
    inputTokens: report.input_tokens,
    outputTokens: report.output_tokens,
    cacheCreationInputTokens: report.cache_creation_input_tokens,
    cacheReadInputTokens: report.cache_read_input_tokens,
    costCents: calculateCostCents(report),
    latencyMs: metadata.latencyMs,
    isToolUse: metadata.isToolUse,
  };
}

export function getPricingForModel(model: LlmModel) {
  return PRICING[model];
}

export function getModelDisplayName(model: LlmModel): string {
  switch (model) {
    case 'haiku_4_5': return 'Haiku 4.5';
    case 'sonnet_4_6': return 'Sonnet 4.6';
    case 'opus_4_6': return 'Opus 4.6';
  }
}
