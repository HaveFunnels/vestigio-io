// ──────────────────────────────────────────────
// LLM Module — Public API
// ──────────────────────────────────────────────

export { executePipeline } from './pipeline';
export type { PipelineCallbacks, PipelineOptions } from './pipeline';
export { isLlmEnabled } from './client';
export { sanitizeInput } from './sanitizer';
export { checkAndRecordRateLimit, cleanupStaleWindows } from './rate-limiter';
export { buildSystemPrompt, buildCacheableSystemPrompt } from './system-prompt';
export { buildClaudeTools, executeToolCall, isExpensiveTool } from './tool-adapter';
export { buildMessagesArray, addMessageToConversation, createEmptyConversation } from './context-manager';
export { buildEmbeddingIndex, buildEmbeddingIndexSync, searchFindings, searchFindingsSync, hasEmbeddings, hasVectorEmbeddings, clearEmbeddings, getEmbeddingMode } from './embeddings';
export { getOrgMemory, saveOrgMemory, updateMemoryFromTurn, buildMemoryContext } from './conversation-memory';
export { fastGuard } from './fast-guard';

export type {
  ModelTier,
  ModelId,
  PipelineRequest,
  PipelineResponse,
  InputGuardResult,
  OutputClassifierResult,
  ConversationMessage,
  ConversationState,
  ToolCallRecord,
  OrgContext,
  SanitizeResult,
  RateLimitResult,
  LlmErrorCategory,
} from './types';

export {
  MODEL_MAP,
  MODEL_API_MAP,
  TIER_TO_MODEL,
  TIER_QUERY_COST,
  LlmError,
} from './types';
