// ──────────────────────────────────────────────
// Conversation Memory — Cross-Session Persistence
//
// Claude remembers key patterns and preferences
// across conversations for personalized analysis.
//
// Stores: frequently asked topics, preferred detail level,
// known concerns, past action items, language preference.
//
// Memory is per-org (not per-user) so team members
// benefit from accumulated context.
//
// Storage: Prisma PlatformConfig table (key-value).
// ──────────────────────────────────────────────

export interface OrgMemory {
  /** Topics the user asks about most frequently */
  frequent_topics: string[];
  /** Findings the user has shown interest in */
  findings_of_interest: string[];
  /** Actions the user has saved or discussed */
  tracked_actions: string[];
  /** Preferences (e.g., "prefers brief answers", "always asks about chargeback") */
  preferences: string[];
  /** Key insights discovered across conversations */
  key_insights: string[];
  /** Last updated timestamp */
  updated_at: string;
}

const DEFAULT_MEMORY: OrgMemory = {
  frequent_topics: [],
  findings_of_interest: [],
  tracked_actions: [],
  preferences: [],
  key_insights: [],
  updated_at: new Date().toISOString(),
};

const MAX_ITEMS_PER_FIELD = 20;

// ── In-Memory Cache ──────────────────────────

const memoryCache = new Map<string, OrgMemory>();

/** Get org memory (from cache or DB) */
export async function getOrgMemory(orgId: string): Promise<OrgMemory> {
  if (memoryCache.has(orgId)) return memoryCache.get(orgId)!;

  try {
    const { prisma } = await import('../../../src/libs/prismaDb').catch(() => ({ prisma: null }));
    if (prisma) {
      const row = await (prisma as any).platformConfig.findUnique({
        where: { configKey: `org_memory:${orgId}` },
      });
      if (row?.value) {
        const memory = JSON.parse(row.value) as OrgMemory;
        memoryCache.set(orgId, memory);
        return memory;
      }
    }
  } catch { /* DB not available */ }

  memoryCache.set(orgId, { ...DEFAULT_MEMORY });
  return { ...DEFAULT_MEMORY };
}

/** Save org memory to cache + DB */
export async function saveOrgMemory(orgId: string, memory: OrgMemory): Promise<void> {
  memory.updated_at = new Date().toISOString();

  // Trim to max items
  memory.frequent_topics = memory.frequent_topics.slice(-MAX_ITEMS_PER_FIELD);
  memory.findings_of_interest = memory.findings_of_interest.slice(-MAX_ITEMS_PER_FIELD);
  memory.tracked_actions = memory.tracked_actions.slice(-MAX_ITEMS_PER_FIELD);
  memory.preferences = memory.preferences.slice(-MAX_ITEMS_PER_FIELD);
  memory.key_insights = memory.key_insights.slice(-MAX_ITEMS_PER_FIELD);

  memoryCache.set(orgId, memory);

  try {
    const { prisma } = await import('../../../src/libs/prismaDb').catch(() => ({ prisma: null }));
    if (prisma) {
      await (prisma as any).platformConfig.upsert({
        where: { configKey: `org_memory:${orgId}` },
        create: { configKey: `org_memory:${orgId}`, value: JSON.stringify(memory) },
        update: { value: JSON.stringify(memory) },
      });
    }
  } catch { /* fire-and-forget */ }
}

/** Update memory from a completed conversation turn */
export async function updateMemoryFromTurn(
  orgId: string,
  userMessage: string,
  toolsCalled: string[],
  findingsReferenced: string[],
  actionsSaved: string[],
): Promise<void> {
  const memory = await getOrgMemory(orgId);

  // Track frequent topics from user messages
  const topicKeywords = extractTopics(userMessage);
  for (const topic of topicKeywords) {
    if (!memory.frequent_topics.includes(topic)) {
      memory.frequent_topics.push(topic);
    }
  }

  // Track findings of interest
  for (const fId of findingsReferenced) {
    if (!memory.findings_of_interest.includes(fId)) {
      memory.findings_of_interest.push(fId);
    }
  }

  // Track saved actions
  for (const aId of actionsSaved) {
    if (!memory.tracked_actions.includes(aId)) {
      memory.tracked_actions.push(aId);
    }
  }

  await saveOrgMemory(orgId, memory);
}

/** Build memory context string for system prompt injection */
export function buildMemoryContext(memory: OrgMemory): string | null {
  const parts: string[] = [];

  if (memory.frequent_topics.length > 0) {
    parts.push(`Frequently discussed: ${memory.frequent_topics.slice(-5).map(sanitizeMemoryField).join(', ')}`);
  }
  if (memory.findings_of_interest.length > 0) {
    parts.push(`Previously explored findings: ${memory.findings_of_interest.length} findings`);
  }
  if (memory.tracked_actions.length > 0) {
    parts.push(`${memory.tracked_actions.length} actions tracked from previous conversations`);
  }
  if (memory.preferences.length > 0) {
    parts.push(`User preferences: ${memory.preferences.slice(-3).map(sanitizeMemoryField).join(', ')}`);
  }
  if (memory.key_insights.length > 0) {
    parts.push(`Key insights from past sessions: ${memory.key_insights.slice(-3).map(sanitizeMemoryField).join('; ')}`);
  }

  if (parts.length === 0) return null;

  return `CROSS-SESSION CONTEXT (from previous conversations):\n${parts.join('\n')}`;
}

// ── Memory Field Sanitization ───────────────
// Prevent prompt injection via poisoned memory entries.
// Memory is stored in DB and could be tampered.

const MEMORY_INJECTION_PATTERNS = [
  /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules)/i,
  /(?:you\s+are|I\s+am)\s+now/i,
  /system\s*prompt/i,
  /\b(?:DAN|JAILBREAK|STAN)\b/,
  /\[(?:SYSTEM|INST|ASSISTANT)\]/i,
];

function sanitizeMemoryField(field: string): string {
  let clean = String(field).slice(0, 200); // Hard cap per field
  // Strip control chars
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
  // Neutralize injection patterns by replacing with [FILTERED]
  for (const pattern of MEMORY_INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      clean = clean.replace(pattern, '[FILTERED]');
    }
  }
  return clean;
}

// ── Topic Extraction ─────────────────────────

const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /revenue|money|loss|leak/i, topic: 'revenue' },
  { pattern: /chargeback|dispute|refund/i, topic: 'chargeback' },
  { pattern: /scale|traffic|growth/i, topic: 'scale' },
  { pattern: /checkout|cart|payment/i, topic: 'checkout' },
  { pattern: /trust|security|ssl/i, topic: 'trust' },
  { pattern: /onboarding|activation|trial/i, topic: 'onboarding' },
  { pattern: /mobile|responsive/i, topic: 'mobile' },
  { pattern: /measurement|tracking|analytics/i, topic: 'measurement' },
  { pattern: /policy|terms|privacy/i, topic: 'policy' },
  { pattern: /support|contact|help/i, topic: 'support' },
];

function extractTopics(message: string): string[] {
  const topics: string[] = [];
  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(message) && !topics.includes(topic)) {
      topics.push(topic);
    }
  }
  return topics;
}
