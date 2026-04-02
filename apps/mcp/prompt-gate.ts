// ──────────────────────────────────────────────
// Prompt Gate — Query Draft Layer
//
// Pre-dispatch MCP step that evaluates prompt
// quality before sending. Detects:
//   - Accidental submit / misfire
//   - Vague low-value prompts
//   - Too-broad prompts
//   - Prompts that can be rewritten for more value
//
// Rules:
//   - NEVER block the user completely
//   - Only intervene when clearly useful
//   - Fast path must remain smooth
//   - This draft layer must be cheap
// ──────────────────────────────────────────────

export interface PromptDraftResult {
  quality: 'good' | 'weak' | 'misfire';
  reason: string;
  suggested_rewrite?: string;
  should_confirm: boolean;
}

export interface PromptContext {
  recent_questions: string[];
  explored_packs: string[];
  explored_maps: string[];
  mcp_remaining: number;
  mcp_pct: number; // 0-100 usage
  has_findings: boolean;
  has_root_causes: boolean;
  finding_count: number;
  top_impact_area: string | null;
}

// ──────────────────────────────────────────────
// Misfire detection patterns
// ──────────────────────────────────────────────

const MISFIRE_PATTERNS = [
  /^\s*$/,                   // empty
  /^[a-z]{1,2}$/i,          // single/double char
  /^(hi|hey|hello|ok|yes|no|y|n|test|asdf|asd)\s*$/i,
  /^\.+$/,                  // just dots
  /^\?+$/,                  // just question marks
  /^[^a-zA-Z]*$/,           // no alphabetic chars
];

const VAGUE_PATTERNS = [
  { pattern: /^(help|help me|what|how|show me|tell me|anything)\s*\??$/i, reason: 'Too vague — no specific topic' },
  { pattern: /^what (can you|do you|should i)\s*\w{0,4}\s*\??$/i, reason: 'Meta-question about capabilities' },
  { pattern: /^(everything|all|show all|give me everything)\s*$/i, reason: 'Too broad — covers everything' },
  { pattern: /^(is it|is there|are there|does it)\s*\w{0,5}\s*\??$/i, reason: 'Yes/no question with no context' },
];

const BROAD_PATTERNS = [
  { pattern: /^(what's wrong|what is wrong|any issues|any problems)\s*\??$/i, rewrite: 'What are the top 3 issues costing me the most money?' },
  { pattern: /^(check|analyze|audit|review)\s*(my|the|this)?\s*(site|website|page|store)?\s*$/i, rewrite: 'Run a full analysis and show the highest-impact findings.' },
  { pattern: /^(how am i doing|how is my|status|overview)\s*\??$/i, rewrite: 'Give me a readiness assessment — can I safely scale traffic?' },
  { pattern: /^(what should i do|what to do|next steps)\s*\??$/i, rewrite: 'What should I fix first based on impact and urgency?' },
];

// ──────────────────────────────────────────────
// Rewrite suggestions based on context
// ──────────────────────────────────────────────

function suggestContextualRewrite(input: string, ctx: PromptContext): string | undefined {
  const lower = input.toLowerCase().trim();

  // If user asks about money/revenue broadly, sharpen it
  if (/money|revenue|losing|leaking|cost/i.test(lower) && !lower.includes('top') && !lower.includes('specific')) {
    return 'Show me the top 3 revenue leaks and their estimated monthly cost.';
  }

  // If user asks about fixing broadly, sharpen it
  if (/fix|improve|optimize/i.test(lower) && !lower.includes('first') && !lower.includes('priority')) {
    return 'What should I fix first based on financial impact?';
  }

  // If user asks about scaling without specifics
  if (/scale|traffic|grow/i.test(lower) && lower.split(/\s+/).length < 5) {
    return 'Can I safely scale traffic? What are the risks?';
  }

  // If user hasn't explored root causes and asks "why"
  if (/why/i.test(lower) && !ctx.explored_packs.includes('root_cause') && ctx.has_root_causes) {
    return 'What are the underlying root causes connecting my issues?';
  }

  // Near budget limit — suggest higher-value question
  if (ctx.mcp_pct >= 80 && ctx.mcp_remaining <= 3) {
    if (ctx.top_impact_area) {
      return `What's the single most impactful fix for ${ctx.top_impact_area}?`;
    }
    return 'What is the single highest-value action I should take today?';
  }

  return undefined;
}

// ──────────────────────────────────────────────
// Duplicate / repetition detection
// ──────────────────────────────────────────────

function isRepetitive(input: string, recentQuestions: string[]): boolean {
  const normalized = input.toLowerCase().trim().replace(/[?!.]+$/, '');
  for (const q of recentQuestions.slice(-5)) {
    const normQ = q.toLowerCase().trim().replace(/[?!.]+$/, '');
    if (normQ === normalized) return true;
    // Levenshtein-like: if >80% similar
    if (normalized.length > 10 && normQ.length > 10) {
      const overlap = longestCommonSubstring(normalized, normQ);
      if (overlap / Math.max(normalized.length, normQ.length) > 0.8) return true;
    }
  }
  return false;
}

function longestCommonSubstring(a: string, b: string): number {
  let max = 0;
  const m = a.length;
  const n = b.length;
  // Simple O(mn) approach — inputs are short
  for (let i = 0; i < m; i++) {
    let len = 0;
    for (let j = 0; j < n && i + len < m; j++) {
      if (a[i + len] === b[j]) {
        len++;
        if (len > max) max = len;
      } else {
        len = 0;
      }
    }
  }
  return max;
}

// ──────────────────────────────────────────────
// Main evaluation function
// ──────────────────────────────────────────────

export function evaluatePromptDraft(
  input: string,
  context: PromptContext,
): PromptDraftResult {
  const trimmed = input.trim();

  // 1. Misfire detection
  for (const pattern of MISFIRE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        quality: 'misfire',
        reason: 'This looks like an accidental submit.',
        should_confirm: true,
      };
    }
  }

  // Very short input (< 4 chars) that's not a clear intent
  if (trimmed.length < 4 && !/^(fix|why|how)$/i.test(trimmed)) {
    return {
      quality: 'misfire',
      reason: 'Input is too short to be useful.',
      should_confirm: true,
    };
  }

  // 2. Vague pattern detection
  for (const { pattern, reason } of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      const rewrite = suggestContextualRewrite(trimmed, context);
      return {
        quality: 'weak',
        reason,
        suggested_rewrite: rewrite || 'Try asking about a specific area: revenue, scaling, or what to fix first.',
        should_confirm: true,
      };
    }
  }

  // 3. Broad prompt detection
  for (const { pattern, rewrite } of BROAD_PATTERNS) {
    if (pattern.test(trimmed)) {
      const contextualRewrite = suggestContextualRewrite(trimmed, context) || rewrite;
      return {
        quality: 'weak',
        reason: 'This question is broad. A more specific version will give you better insights.',
        suggested_rewrite: contextualRewrite,
        should_confirm: true,
      };
    }
  }

  // 4. Repetition detection
  if (isRepetitive(trimmed, context.recent_questions)) {
    return {
      quality: 'weak',
      reason: 'You asked something similar recently. Try a follow-up instead.',
      suggested_rewrite: context.has_findings
        ? 'What should I focus on next based on what we just discussed?'
        : undefined,
      should_confirm: true,
    };
  }

  // 5. Budget-aware check — at very low budget, suggest higher-value rewrites
  if (context.mcp_pct >= 90 && context.mcp_remaining <= 2) {
    const betterQuestion = suggestContextualRewrite(trimmed, context);
    if (betterQuestion && betterQuestion !== trimmed) {
      return {
        quality: 'weak',
        reason: `You have ${context.mcp_remaining} query left today. This rewrite may give you more value.`,
        suggested_rewrite: betterQuestion,
        should_confirm: true,
      };
    }
  }

  // 6. Context-aware rewrite suggestion (for good prompts that could be better)
  const rewrite = suggestContextualRewrite(trimmed, context);
  if (rewrite && rewrite !== trimmed && trimmed.split(/\s+/).length < 6) {
    return {
      quality: 'weak',
      reason: 'This question could be made more specific for better results.',
      suggested_rewrite: rewrite,
      should_confirm: true,
    };
  }

  // 7. Good prompt — pass through
  return {
    quality: 'good',
    reason: 'Prompt is clear and specific.',
    should_confirm: false,
  };
}

// ──────────────────────────────────────────────
// Metrics tracking
// ──────────────────────────────────────────────

export interface PromptGateMetrics {
  total_evaluated: number;
  good_count: number;
  weak_count: number;
  misfire_count: number;
  rewrites_accepted: number;
  rewrites_rejected: number;
}

const metrics: PromptGateMetrics = {
  total_evaluated: 0,
  good_count: 0,
  weak_count: 0,
  misfire_count: 0,
  rewrites_accepted: 0,
  rewrites_rejected: 0,
};

export function recordPromptEvaluation(result: PromptDraftResult): void {
  metrics.total_evaluated++;
  if (result.quality === 'good') metrics.good_count++;
  else if (result.quality === 'weak') metrics.weak_count++;
  else if (result.quality === 'misfire') metrics.misfire_count++;
}

export function recordRewriteDecision(accepted: boolean): void {
  if (accepted) metrics.rewrites_accepted++;
  else metrics.rewrites_rejected++;
}

export function getPromptGateMetrics(): PromptGateMetrics {
  return { ...metrics };
}

export function resetPromptGateMetrics(): void {
  metrics.total_evaluated = 0;
  metrics.good_count = 0;
  metrics.weak_count = 0;
  metrics.misfire_count = 0;
  metrics.rewrites_accepted = 0;
  metrics.rewrites_rejected = 0;
}
