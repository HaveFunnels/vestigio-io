// ──────────────────────────────────────────────
// LLM Pipeline Types
//
// All types for the 3-layer Claude pipeline:
//   Input Guard (Haiku) → Core (Sonnet/Opus) → Output Classifier (Haiku)
// ──────────────────────────────────────────────

import type { McpSessionContext } from '../types';
import type { PlanKey } from '../../../packages/plans';

// ── Model Tiers ──────────────────────────────

/** Backend-only tier identifiers — never exposed to frontend */
export type ModelTier = 'default' | 'ultra';

/** Internal model identifiers for cost tracking */
export type ModelId = 'haiku_4_5' | 'sonnet_4_6' | 'opus_4_6';

/** Maps user-facing tier to Anthropic model ID */
export const MODEL_MAP: Record<ModelTier, string> = {
  default: 'claude-sonnet-4-6',
  ultra: 'claude-opus-4-6',
};

/** Maps model ID to Anthropic API model string */
export const MODEL_API_MAP: Record<ModelId, string> = {
  haiku_4_5: 'claude-haiku-4-5-20251001',
  sonnet_4_6: 'claude-sonnet-4-6',
  opus_4_6: 'claude-opus-4-6',
};

/** Maps tier to internal model ID */
export const TIER_TO_MODEL: Record<ModelTier, ModelId> = {
  default: 'sonnet_4_6',
  ultra: 'opus_4_6',
};

/** MCP query cost per tier */
export const TIER_QUERY_COST: Record<ModelTier, number> = {
  default: 1,
  ultra: 3,
};

// ── Input Guard ──────────────────────────────

export type InputGuardCategory =
  | 'clean'
  | 'prompt_injection'
  | 'off_topic'
  | 'pii_detected'
  | 'xss_detected'
  | 'policy_violation';

export interface InputGuardResult {
  safe: boolean;
  category: InputGuardCategory;
  reason: string;
  rewritten_input?: string;
}

// ── Output Classifier ────────────────────────

export interface OutputClassifierResult {
  safe: boolean;
  issues: string[];
  sanitized_response?: string;
}

// ── Conversation ─────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tool_results_summary?: string;
}

export interface ConversationState {
  messages: ConversationMessage[];
  summary_of_older: string | null;
  total_message_count: number;
}

// ── Tool Calls ───────────────────────────────

export interface ToolCallRecord {
  tool_name: string;
  params: Record<string, unknown>;
  result_type: string;
  result_summary: string;
  execution_ms: number;
}

// ── Pipeline ─────────────────────────────────

export interface OrgContext {
  org_id: string;
  org_name: string;
  environment_id: string;
  domain: string;
  business_model: string;
  monthly_revenue: number | null;
  plan: PlanKey;
  freshness_state: string;
  finding_count: number;
  top_findings_summary: string;
  locale: string; // 'en' | 'pt-BR' | 'es' | 'de'
}

export interface AttachedFile {
  name: string;
  type: string;
  content: string; // text content, max 50KB
}

export interface PipelineRequest {
  user_message: string;
  conversation: ConversationState;
  org_context: OrgContext;
  user_id: string;
  conversation_id: string;
  model_tier: ModelTier;
  session_context: McpSessionContext;
  attached_files?: AttachedFile[];
}

export interface PipelineResponse {
  response_text: string;
  request_id: string;
  tool_calls_made: ToolCallRecord[];
  model_tier_used: ModelTier;
  model_id_used: ModelId;
  input_guard_result: InputGuardResult;
  output_classifier_result: OutputClassifierResult;
  tokens: { input: number; output: number };
  guard_tokens: { input: number; output: number };
  classifier_tokens: { input: number; output: number };
  latency_ms: number;
}

// ── LLM Errors ───────────────────────────────

export type LlmErrorCategory =
  | 'rate_limited'
  | 'api_error'
  | 'timeout'
  | 'auth_error'
  | 'content_filtered'
  | 'invalid_response';

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly category: LlmErrorCategory,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

// ── Sanitizer ────────────────────────────────

export interface SanitizeResult {
  sanitized: string;
  violations: string[];
  truncated: boolean;
}

// ── Rate Limiter ─────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: number;
  reason?: string;
}
