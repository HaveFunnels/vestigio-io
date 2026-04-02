import { McpSessionContext } from './types';

// ──────────────────────────────────────────────
// MCP Session Context — tracks user exploration
//
// Persisted per server instance (session-scoped).
// Used by suggestion/question engines to avoid
// repetition and guide exploration.
// ──────────────────────────────────────────────

export function createEmptySession(): McpSessionContext {
  return {
    exploration_state: {
      explored_packs: [],
      explored_root_causes: [],
      explored_maps: [],
      asked_questions: [],
    },
  };
}

export function markPackExplored(ctx: McpSessionContext, pack: string): void {
  if (!ctx.exploration_state.explored_packs.includes(pack)) {
    ctx.exploration_state.explored_packs.push(pack);
  }
}

export function markRootCauseExplored(ctx: McpSessionContext, rootCause: string): void {
  if (!ctx.exploration_state.explored_root_causes.includes(rootCause)) {
    ctx.exploration_state.explored_root_causes.push(rootCause);
  }
}

export function markMapExplored(ctx: McpSessionContext, mapType: string): void {
  if (!ctx.exploration_state.explored_maps.includes(mapType)) {
    ctx.exploration_state.explored_maps.push(mapType);
  }
}

export function markQuestionAsked(ctx: McpSessionContext, question: string): void {
  if (!ctx.exploration_state.asked_questions.includes(question)) {
    ctx.exploration_state.asked_questions.push(question);
  }
}

export function setActiveWorkspace(ctx: McpSessionContext, workspace: string): void {
  ctx.active_workspace = workspace;
}

export function setSelectedFindings(ctx: McpSessionContext, findings: string[]): void {
  ctx.selected_findings = findings;
}

export function setSelectedActions(ctx: McpSessionContext, actions: string[]): void {
  ctx.selected_actions = actions;
}

export function setLastViewedMap(ctx: McpSessionContext, mapType: string): void {
  ctx.last_viewed_map = mapType;
  markMapExplored(ctx, mapType);
}
