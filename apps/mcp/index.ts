export { McpServer } from './server';
export type { McpServerConfig } from './server';
export { executeTool, TOOL_DEFINITIONS } from './tools';
export type { ToolResult } from './tools';
export { assembleContext } from './context';
export type { EngineContext } from './context';
export {
  composeScaleReadinessAnswer,
  composeRevenueIntegrityAnswer,
  composeRootCauseAnswer,
  composeFixFirstAnswer,
  composeSaasGrowthAnswer,
} from './answers';
export { createVerificationRequest, validateVerificationRequest } from './verification';
export * from './types';
export {
  buildSaasChecklist,
  composeSaasSetupAnswer,
  canRequestAuthenticatedVerification,
  composeAuthOutcomeAnswer,
  describeSaasAccessStatus,
  type SaasSetupChecklist,
  type SaasChecklistItem,
} from './saas-awareness';

// Phase 20 — MCP Addictiveness Layer
export {
  evaluatePromptDraft,
  recordPromptEvaluation,
  recordRewriteDecision,
  getPromptGateMetrics,
  resetPromptGateMetrics,
  type PromptDraftResult,
  type PromptContext,
  type PromptGateMetrics,
} from './prompt-gate';
export {
  buildEnhancedSuggestions,
  recordSuggestionClick,
  getSuggestionClickLog,
  getSuggestionClickStats,
  resetSuggestionClicks,
  type EnhancedSuggestions,
  type ChainSuggestion,
  type SuggestionContext,
  type SuggestionClickEvent,
} from './suggestion-engine-v2';
export {
  PLAYBOOKS,
  getAvailablePlaybooks,
  canRunPlaybook,
  getPlaybook,
  startPlaybookRun,
  advancePlaybookRun,
  abandonPlaybookRun,
  getPlaybookRuns,
  getPlaybookStats,
  resetPlaybookRuns,
  type Playbook,
  type PlaybookStep,
  type PlaybookRun,
} from './playbooks';
export {
  PLAYBOOK_PROMPTS,
  PLAYBOOK_CATEGORY_META,
  getAvailablePlaybookPrompts,
  getPlaybookPromptsByCategory,
  getPlaybookPrompt,
  getAllCategories,
  type PlaybookPrompt,
  type PlaybookCategory,
} from './playbook-prompts';
export {
  buildAvailableChains,
  getChainFrom,
  getBestChainForDomain,
  getHighValueChains,
  type ChainLink,
  type ChainPath,
  type ChainNodeType,
} from './context-chaining';
