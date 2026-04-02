// ──────────────────────────────────────────────
// Anthropic SDK Client — Singleton with Retry
//
// Single entry point for all Claude API calls.
// Handles: model selection, timeouts, retries, error wrapping.
// ──────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { ModelId, MODEL_API_MAP, LlmError } from './types';

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
): Promise<CallModelResult> {
  const anthropic = getClient();
  const modelString = MODEL_API_MAP[modelId];
  const timeout = TIMEOUT_MS[modelId] || 60_000;

  const params: Anthropic.MessageCreateParams = {
    model: modelString,
    messages,
    max_tokens: options.max_tokens,
    temperature: options.temperature ?? 0.3,
    ...(options.system ? { system: options.system as any } : {}),
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

      return {
        content: response.content,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: (response.usage as any).cache_read_input_tokens ?? 0,
        },
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

// ── Streaming Call ───────────────────────────

export async function callModelStreaming(
  modelId: ModelId,
  messages: Anthropic.MessageParam[],
  options: CallModelOptions & { onText?: (text: string) => void; onToolUse?: (block: Anthropic.ContentBlock) => void },
): Promise<CallModelResult> {
  const anthropic = getClient();
  const modelString = MODEL_API_MAP[modelId];

  const params: Anthropic.MessageCreateParams = {
    model: modelString,
    messages,
    max_tokens: options.max_tokens,
    temperature: options.temperature ?? 0.3,
    stream: true as any,
    ...(options.system ? { system: options.system as any } : {}),
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
