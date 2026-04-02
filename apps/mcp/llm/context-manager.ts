// ──────────────────────────────────────────────
// Context Manager — Sliding Window + Auto-Compaction
//
// Manages conversation context for Claude API calls.
// Strategy: last 6 messages in full, older messages summarized.
// Summary is auto-compacted to MAX_SUMMARY_CHARS to prevent
// unbounded growth. Compaction is internal — never shown to user.
// Hard cap: ~8000 tokens total (system + messages).
// ──────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk';
import type { ConversationState, ConversationMessage } from './types';

const SLIDING_WINDOW_SIZE = 6; // Keep last 6 messages (3 turns) in full
const ROUGH_CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_TOKENS = 8000;
const MAX_SUMMARY_CHARS = 600; // Hard cap on summary length (~150 tokens)

// ── Build Messages Array for Claude ──────────

export function buildMessagesArray(
  conversation: ConversationState,
  newUserMessage: string,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  // 1. Inject summary of older messages (if exists)
  if (conversation.summary_of_older) {
    messages.push({
      role: 'user',
      content: '[Conversation context:]',
    });
    messages.push({
      role: 'assistant',
      content: conversation.summary_of_older,
    });
  }

  // 2. Add recent messages from sliding window
  const recentMessages = conversation.messages.slice(-SLIDING_WINDOW_SIZE);
  for (const msg of recentMessages) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // 3. Add the new user message
  messages.push({
    role: 'user',
    content: newUserMessage,
  });

  // 4. Ensure messages don't exceed token budget
  return trimToTokenBudget(messages, MAX_CONTEXT_TOKENS);
}

// ── Update Conversation State ────────────────

export function addMessageToConversation(
  state: ConversationState,
  message: ConversationMessage,
): ConversationState {
  const newMessages = [...state.messages, message];
  const newCount = state.total_message_count + 1;

  // Under window size — no compaction needed
  if (newMessages.length <= SLIDING_WINDOW_SIZE) {
    return {
      messages: newMessages,
      summary_of_older: state.summary_of_older,
      total_message_count: newCount,
    };
  }

  // Over window: summarize overflow and compact
  const overflow = newMessages.slice(0, newMessages.length - SLIDING_WINDOW_SIZE);
  const overflowSummary = summarizeMessagesLocally(overflow);

  // Merge with existing summary, then compact to hard limit
  const merged = state.summary_of_older
    ? `${state.summary_of_older}\n${overflowSummary}`
    : overflowSummary;

  return {
    messages: newMessages.slice(-SLIDING_WINDOW_SIZE),
    summary_of_older: compactSummary(merged),
    total_message_count: newCount,
  };
}

export function createEmptyConversation(): ConversationState {
  return {
    messages: [],
    summary_of_older: null,
    total_message_count: 0,
  };
}

// ── Auto-Compaction ──────────────────────────
// Keeps summary within MAX_SUMMARY_CHARS by dropping
// oldest entries. The user never sees this process.

function compactSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_CHARS) return summary;

  // Split into lines, drop oldest until within budget
  const lines = summary.split('\n').filter(Boolean);

  // Keep at minimum the last 3 lines (most recent context)
  while (lines.length > 3 && lines.join('\n').length > MAX_SUMMARY_CHARS) {
    lines.shift();
  }

  let result = lines.join('\n');

  // If still over, hard truncate with ellipsis
  if (result.length > MAX_SUMMARY_CHARS) {
    result = '...' + result.slice(result.length - MAX_SUMMARY_CHARS + 3);
  }

  return result;
}

// ── Local Summarization (zero-cost) ──────────
// Extracts key facts from messages without calling an LLM.

function summarizeMessagesLocally(messages: ConversationMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const preview = msg.content.slice(0, 80).replace(/\n/g, ' ');
      parts.push(`Q: "${preview}${msg.content.length > 80 ? '...' : ''}"`);
    } else if (msg.role === 'assistant') {
      const facts = extractAssistantFacts(msg.content);
      if (facts) parts.push(`A: ${facts}`);
    }
  }

  return parts.join('\n');
}

function extractAssistantFacts(content: string): string {
  const facts: string[] = [];

  // First meaningful sentence
  const firstSentence = content.match(/^[^.!?]{10,}[.!?]/);
  if (firstSentence) {
    facts.push(firstSentence[0].slice(0, 100));
  }

  // Dollar amounts (key data points)
  const dollarMatches = content.match(/\$[\d,]+(?:\.\d+)?(?:\/mo|k\/mo)?/g);
  if (dollarMatches) {
    facts.push(dollarMatches.slice(0, 2).join(', '));
  }

  // Finding/action references
  const findingRefs = content.match(/\$\$FINDING\{[^}]+\}\$\$/g);
  if (findingRefs) facts.push(`${findingRefs.length} findings referenced`);

  return facts.join('. ') || content.slice(0, 100);
}

// ── Token Budget Management ──────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / ROUGH_CHARS_PER_TOKEN);
}

function trimToTokenBudget(
  messages: Anthropic.MessageParam[],
  maxTokens: number,
): Anthropic.MessageParam[] {
  let totalTokens = messages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return sum + estimateTokens(content);
  }, 0);

  if (totalTokens <= maxTokens) return messages;

  // Strategy: always preserve the LAST message (new user question)
  // and try to keep the summary pair (first 2 messages if they exist).
  // Drop from the middle — oldest conversation messages first.
  const result = [...messages];

  // Find safe removal zone: between summary (indices 0-1) and last message
  while (totalTokens > maxTokens && result.length > 3) {
    // Remove the 3rd element (index 2) — oldest non-summary message
    // This preserves: [summary_user, summary_assistant, ..., NEW_USER_MSG]
    const removeIdx = Math.min(2, result.length - 2); // never remove last
    const removed = result.splice(removeIdx, 1)[0];
    const content = typeof removed.content === 'string' ? removed.content : JSON.stringify(removed.content);
    totalTokens -= estimateTokens(content);
  }

  // If still over budget with only 3 messages, drop the summary pair
  if (totalTokens > maxTokens && result.length === 3) {
    result.splice(0, 2); // Remove summary, keep only the user message
  }

  return result;
}
