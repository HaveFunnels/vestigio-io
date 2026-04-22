// ──────────────────────────────────────────────
// Chat Types — Block-based message system
//
// Messages are arrays of ContentBlocks.
// Each block is a discriminated union rendered
// by ChatMessageRenderer.
// ──────────────────────────────────────────────

import type { FindingProjection, ActionProjection } from '../../packages/projections';

// ── Model Config ─────────────────────────────

export type ModelId = 'sonnet_4_6' | 'opus_4_6';
export type ModelLabel = 'Default' | 'Ultra';

export interface ModelConfig {
  id: ModelId;
  label: ModelLabel;
  description: string;
  minPlan: 'vestigio' | 'pro' | 'max';
  queryCost: number;
}

export const MODELS: Record<ModelId, ModelConfig> = {
  sonnet_4_6: {
    id: 'sonnet_4_6',
    label: 'Default',
    description: 'Fast, balanced analysis',
    minPlan: 'vestigio',
    queryCost: 1,
  },
  opus_4_6: {
    id: 'opus_4_6',
    label: 'Ultra',
    description: 'Deep analysis',
    minPlan: 'pro',
    queryCost: 3,
  },
};

// ── Content Blocks ───────────────────────────

export type ContentBlock =
  | MarkdownBlock
  | FindingCardBlock
  | ActionCardBlock
  | ImpactSummaryBlock
  | NavigationCtaBlock
  | ToolCallBlock
  | SuggestedPromptsBlock
  | QuoteBlock
  | CreateActionBlock
  | DataRowsBlock
  | KbArticleCardBlock
  | VoiceMessageBlock;

export interface MarkdownBlock {
  type: 'markdown';
  content: string;
}

export interface FindingCardBlock {
  type: 'finding_card';
  finding: {
    id: string;
    title: string;
    severity: string;
    impact_mid: number;
    impact_min: number;
    impact_max: number;
    pack: string;
    root_cause: string | null;
  };
}

export interface ActionCardBlock {
  type: 'action_card';
  action: {
    id: string;
    title: string;
    severity: string;
    impact_mid: number;
    cross_pack: boolean;
    priority_score: number;
  };
}

export interface ImpactSummaryBlock {
  type: 'impact_summary';
  summary: {
    min: number;
    max: number;
    mid: number;
    type: string;
    currency: string;
  };
}

export interface NavigationCtaBlock {
  type: 'navigation_cta';
  targets: Array<{
    label: string;
    href: string;
    variant: 'workspace' | 'map' | 'analysis' | 'actions' | 'changes' | 'primary' | 'secondary';
  }>;
}

export interface ToolCallBlock {
  type: 'tool_call';
  toolName: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  label: string;
  durationMs?: number;
  resultPreview?: string;
}

export interface SuggestedPromptsBlock {
  type: 'suggested_prompts';
  prompts: string[];
}

export interface QuoteBlock {
  type: 'quote';
  text: string;
  source?: string;
}

export interface DataRowsBlock {
  type: 'data_rows';
  label: string;
  rows: Array<{
    label: string;
    value: string;
    severity?: string;
  }>;
}

export interface CreateActionBlock {
  type: 'create_action';
  title: string;
  description: string;
  severity: string;
  estimatedImpact?: number;
}

/**
 * Inline knowledge base article reference. Emitted by the LLM via
 * $$KB{finding:<inference_key>}$$ or $$KB{root_cause:<root_cause_key>}$$
 * markers and resolved server-side. Renders as a styled card linking
 * to the matching article (or to the catalog filtered by key when
 * no Sanity article exists yet).
 */
export interface KbArticleCardBlock {
  type: 'kb_article_card';
  /** Stable lookup key — either a finding inference_key or a root_cause_key */
  key: string;
  /** What kind of key — disambiguates the lookup endpoint */
  key_kind: 'finding' | 'root_cause';
  /** Resolved title — falls back to a generic browse label if missing */
  title: string | null;
  /** Resolved slug for routing — null when no Sanity article exists */
  slug: string | null;
  /** Optional excerpt for the card preview */
  excerpt: string | null;
}

export interface VoiceMessageBlock {
  type: 'voice_message';
  /** URL to the audio blob (object URL or uploaded URL) */
  audioSrc: string;
  /** Duration in seconds */
  duration: number;
  /** Optional transcript from speech-to-text */
  transcript?: string;
}

// ── Messages ─────────────────────────────────

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  blocks: ContentBlock[];
  model?: ModelId;
  tokens?: { input: number; output: number };
  costCents?: number;
  createdAt: Date;
  streaming?: boolean;
}

// ── Conversations ────────────────────────────

export interface Conversation {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── SSE Events ───────────────────────────────

export type ChatSSEEvent =
  | { type: 'guard'; data: { safe: boolean; category: string } }
  | { type: 'tool_start'; data: { tool: string; label: string } }
  | { type: 'tool_done'; data: { tool: string; summary: string } }
  | { type: 'delta'; data: { text: string } }
  | { type: 'done'; data: { response: string; model_tier: string; tokens: { input: number; output: number }; tool_calls: Array<{ tool: string; summary: string; ms: number }>; latency_ms: number } }
  | { type: 'error'; data: { message: string; code: string } };
