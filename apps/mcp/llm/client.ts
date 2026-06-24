// ──────────────────────────────────────────────
// Anthropic SDK Client — Singleton with Retry
//
// Single entry point for all Claude API calls.
// Handles: model selection, timeouts, retries, error wrapping,
// per-call telemetry (TokenCostLedger), and the per-org monthly
// cost circuit-breaker.
//
// Every callModel call REQUIRES an LlmCallContext naming the purpose
// and (when known) the org/user/conversation it belongs to. The
// context drives both the ledger write and the circuit-breaker
// check — without it we'd be flying blind on cost.
// ──────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { ModelId, MODEL_API_MAP, LlmError } from './types';
import { calculateCostCents, type ClaudeUsageReport } from '../../platform/token-cost';
import { getTokenLedgerStore } from '../../platform/token-ledger';
import { isOrgOverLlmBudget } from '../../platform/llm-cost-cap';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LlmError('ANTHROPIC_API_KEY not configured', 'auth_error');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function isLlmEnabled(): boolean {
  return process.env.VESTIGIO_LLM_ENABLED === 'true' && !!process.env.ANTHROPIC_API_KEY;
}

// ── Timeouts per model role ──────────────────

const TIMEOUT_MS: Record<string, number> = {
  haiku_4_5: 15_000,
  sonnet_4_6: 60_000,
  opus_4_6: 90_000,
};

// ── Call Model ───────────────────────────────

export interface CallModelOptions {
  max_tokens: number;
  temperature?: number;
  system?: string | Anthropic.MessageCreateParams['system'];
  tools?: Anthropic.Tool[];
  stream?: false;
  signal?: AbortSignal;
}

/**
 * Required context for every Claude call. Drives the TokenCostLedger
 * write (purpose, org/user/conversation) and the per-org monthly cost
 * circuit-breaker. Every callModel invocation must supply one so a new
 * LLM site can't silently skip telemetry.
 *
 * Use `purpose='system'` + no org context for genuinely system-level
 * calls (none today). Use `audit_runner.*` purposes when the call
 * originates from a worker and only has cycle/env context.
 */
export interface LlmCallContext {
  /** Stable label that aggregates the same call site across requests.
   *  Lives in TokenCostLedger.purpose for cost attribution. Examples:
   *  'core_chat' | 'input_guard' | 'output_classifier' |
   *  'framework_lens' | 'pulse_summary' | 'copy_tone' |
   *  'persona_rewrite' | 'test_recommendations' | 'cross_page_copy' |
   *  'ad_message_match' | 'semantic_enrichment.<sub>' |
   *  'micro_copy' | 'pricing_psychology' | 'copy_seo_tension' |
   *  'copy_localization'. */
  purpose: string;
  /** Org ID for ledger + circuit-breaker. Always set in production —
   *  the rare null is for one-off scripts that bypass the gate. */
  organizationId?: string | null;
  /** User ID for chat path; null for cycle-time work. */
  userId?: string | null;
  /** Chat conversation; null off the chat path. */
  conversationId?: string | null;
  /** Env ID for cycle-time call sites — informational only, not
   *  written to the ledger (which is org-scoped). */
  environmentId?: string | null;
  /** Same as above for cycle ID. */
  cycleId?: string | null;
}

export interface CallModelResult {
  content: Anthropic.ContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason: string | null;
  model: string;
}

export async function callModel(
  modelId: ModelId,
  messages: Anthropic.MessageParam[],
  options: CallModelOptions,
  context: LlmCallContext,
): Promise<CallModelResult> {
  // Circuit-breaker — short-circuit before the API call so a runaway
  // org doesn't keep paying for output it'll never use. Failure-mode
  // is benign: callers see an LlmError('cost_cap_exceeded') and fall
  // back to the same path they use when VESTIGIO_LLM_ENABLED is false.
  if (context.organizationId) {
    const over = await isOrgOverLlmBudget(context.organizationId).catch(() => false);
    if (over) {
      throw new LlmError(
        `LLM budget cap reached for org ${context.organizationId} this month`,
        'cost_cap_exceeded',
        429,
        false,
      );
    }
  }

  const anthropic = getClient();
  const modelString = MODEL_API_MAP[modelId];
  const timeout = TIMEOUT_MS[modelId] || 60_000;
  const callStart = Date.now();

  const params: Anthropic.MessageCreateParams = {
    model: modelString,
    messages,
    max_tokens: options.max_tokens,
    temperature: options.temperature ?? 0.3,
    ...(options.system ? { system: maybeWithCacheControl(options.system, modelId) as any } : {}),
    ...(options.tools?.length ? { tools: options.tools } : {}),
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Combine timeout + external abort signal
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      // If external signal aborts, abort our controller too
      if (options.signal) {
        if (options.signal.aborted) { clearTimeout(timer); throw new LlmError('Request cancelled', 'timeout', undefined, false); }
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const response = await anthropic.messages.create(params, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      const usage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: (response.usage as any).cache_read_input_tokens ?? 0,
      };

      // Fire-and-forget ledger write. Latency is dominated by the
      // Anthropic call we just made — adding a Postgres round-trip
      // inline would be silly. Failures log but never block the caller.
      recordLedgerEntryAsync(modelId, usage, context, Date.now() - callStart);

      return {
        content: response.content,
        usage,
        stop_reason: response.stop_reason,
        model: response.model,
      };
    } catch (err: any) {
      lastError = err;

      // Don't retry on non-retryable errors
      if (err?.status === 401 || err?.status === 403) {
        throw new LlmError('Invalid API key', 'auth_error', err.status);
      }
      if (err?.status === 400) {
        throw new LlmError(err.message || 'Bad request', 'invalid_response', 400);
      }

      // Retry on 429 (rate limit) and 5xx
      if (attempt < 1 && (err?.status === 429 || err?.status >= 500 || err?.name === 'AbortError')) {
        const delay = err?.status === 429 ? 2000 : 1000;
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        continue;
      }

      break;
    }
  }

  // Wrap final error
  const err = lastError as any;
  if (err?.name === 'AbortError') {
    throw new LlmError(`Model ${modelId} timed out after ${timeout}ms`, 'timeout', undefined, true);
  }
  if (err?.status === 429) {
    throw new LlmError('Rate limited by Anthropic API', 'rate_limited', 429, true);
  }
  throw new LlmError(
    err?.message || 'Unknown API error',
    'api_error',
    err?.status,
    err?.status >= 500,
  );
}

// ── Prompt caching ───────────────────────────

/**
 * Wrap the system prompt in a single TextBlock with
 * `cache_control: { type: "ephemeral" }` when it's long enough to be
 * worth caching. Cache writes cost 1.25× input price (one-time);
 * cache reads cost 0.1× input price (90% discount). The break-even is
 * ~2 reads from the same warm cache. Our system prompts are static
 * across the 5-minute ephemeral TTL window on the cycle paths
 * (semantic_enrichment, framework_lens, domain_fingerprint) — every
 * cell in the same cycle reuses the same prompt, so the cache hit
 * rate is effectively 100% past the first call.
 *
 * Anthropic minimum cache size (June 2026):
 *   - Haiku family: 2048 tokens (~7000 chars at ~3.5 chars/token)
 *   - Sonnet/Opus family: 1024 tokens (~3500 chars)
 *
 * Below the minimum, the API rejects cache_control with a 400. The
 * char-based threshold below is conservative — even a slightly
 * under-tokenized prompt clears it. For prompts under threshold we
 * pass the original string unchanged (no caching, no cost overhead).
 *
 * Callers do nothing — they keep passing `options.system` as a
 * string. The wrapping is purely an internal optimization.
 */
function maybeWithCacheControl(
  system: string | Anthropic.MessageCreateParams['system'],
  modelId: ModelId,
): string | Anthropic.TextBlockParam[] | Anthropic.MessageCreateParams['system'] {
  // Caller already passed array form — assume they shaped cache_control
  // themselves. Pass through unchanged.
  if (typeof system !== 'string') return system;
  const minChars = modelId.startsWith('haiku') ? 7000 : 3500;
  if (system.length < minChars) return system;
  return [{
    type: 'text' as const,
    text: system,
    cache_control: { type: 'ephemeral' as const },
  }];
}

// ── Ledger ───────────────────────────────────

function recordLedgerEntryAsync(
  model: ModelId,
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number },
  context: LlmCallContext,
  latencyMs: number,
): void {
  if (!context.organizationId) {
    // Genuine system call without org context — skip ledger to avoid
    // polluting org-keyed aggregates. These are rare and intentional.
    return;
  }
  const report: ClaudeUsageReport = {
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
  };
  const entry = {
    organizationId: context.organizationId,
    userId: context.userId ?? null,
    conversationId: context.conversationId ?? null,
    model,
    purpose: context.purpose,
    inputTokens: report.input_tokens,
    outputTokens: report.output_tokens,
    cacheCreationInputTokens: report.cache_creation_input_tokens,
    cacheReadInputTokens: report.cache_read_input_tokens,
    costCents: calculateCostCents(report),
    latencyMs,
    isToolUse: context.purpose === 'core_chat',
  };
  getTokenLedgerStore()
    .record(entry)
    .catch((err) => {
      console.warn(
        `[llm-ledger] write failed org=${context.organizationId} purpose=${context.purpose} model=${model}:`,
        err instanceof Error ? err.message : err,
      );
    });
}

// ── Streaming Call ───────────────────────────

export async function callModelStreaming(
  modelId: ModelId,
  messages: Anthropic.MessageParam[],
  options: CallModelOptions & { onText?: (text: string) => void; onToolUse?: (block: Anthropic.ContentBlock) => void },
  context: LlmCallContext,
): Promise<CallModelResult> {
  // Circuit-breaker — same path as non-streaming.
  if (context.organizationId) {
    const over = await isOrgOverLlmBudget(context.organizationId).catch(() => false);
    if (over) {
      throw new LlmError(
        `LLM budget cap reached for org ${context.organizationId} this month`,
        'cost_cap_exceeded',
        429,
        false,
      );
    }
  }
  const streamStart = Date.now();
  const anthropic = getClient();
  const modelString = MODEL_API_MAP[modelId];

  const params: Anthropic.MessageCreateParams = {
    model: modelString,
    messages,
    max_tokens: options.max_tokens,
    temperature: options.temperature ?? 0.3,
    stream: true as any,
    ...(options.system ? { system: maybeWithCacheControl(options.system, modelId) as any } : {}),
    ...(options.tools?.length ? { tools: options.tools } : {}),
  };

  try {
    const stream = await anthropic.messages.create(params) as any;

    const contentBlocks: Anthropic.ContentBlock[] = [];
    let currentTextBlock: { type: 'text'; text: string } | null = null;
    let currentToolBlock: any = null;
    let usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    let stopReason: string | null = null;

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'text') {
            currentTextBlock = { type: 'text', text: '' };
          } else if (event.content_block.type === 'tool_use') {
            currentToolBlock = { ...event.content_block, input: '' };
          }
          break;

        case 'content_block_delta':
          if (event.delta.type === 'text_delta' && currentTextBlock) {
            currentTextBlock.text += event.delta.text;
            options.onText?.(event.delta.text);
          } else if (event.delta.type === 'input_json_delta' && currentToolBlock) {
            currentToolBlock.input += event.delta.partial_json;
          }
          break;

        case 'content_block_stop':
          if (currentTextBlock) {
            contentBlocks.push(currentTextBlock as Anthropic.ContentBlock);
            currentTextBlock = null;
          } else if (currentToolBlock) {
            try {
              currentToolBlock.input = JSON.parse(currentToolBlock.input || '{}');
            } catch {
              currentToolBlock.input = {};
            }
            const block = currentToolBlock as Anthropic.ContentBlock;
            contentBlocks.push(block);
            options.onToolUse?.(block);
            currentToolBlock = null;
          }
          break;

        case 'message_delta':
          stopReason = (event as any).delta?.stop_reason ?? null;
          if ((event as any).usage) {
            usage.output_tokens = (event as any).usage.output_tokens ?? usage.output_tokens;
          }
          break;

        case 'message_start':
          if ((event as any).message?.usage) {
            usage.input_tokens = (event as any).message.usage.input_tokens ?? 0;
            usage.cache_creation_input_tokens = (event as any).message.usage.cache_creation_input_tokens ?? 0;
            usage.cache_read_input_tokens = (event as any).message.usage.cache_read_input_tokens ?? 0;
          }
          break;
      }
    }

    recordLedgerEntryAsync(modelId, usage, context, Date.now() - streamStart);

    return {
      content: contentBlocks,
      usage,
      stop_reason: stopReason,
      model: modelString,
    };
  } catch (err: any) {
    if (err instanceof LlmError) throw err;
    throw new LlmError(err?.message || 'Streaming error', 'api_error', err?.status);
  }
}
