// ──────────────────────────────────────────────
// Conversation Store — Chat Persistence
//
// CRUD for conversations and messages.
// Dual implementation: InMemory (dev) + Prisma (production).
// ──────────────────────────────────────────────

import type { PrismaClient } from '@prisma/client';

// ── Types ────────────────────────────────────

export interface ConversationRecord {
  id: string;
  organizationId: string;
  userId: string;
  environmentId: string | null;
  title: string | null;
  status: string;
  messageCount: number;
  totalCostCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  toolCalls: string | null;
  purpose: string | null;
  createdAt: Date;
}

export interface CreateConversationInput {
  organizationId: string;
  userId: string;
  environmentId?: string;
  title?: string;
}

export interface CreateMessageInput {
  role: string;
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  toolCalls?: string;
  purpose?: string;
}

export interface ListOptions {
  status?: string;
  limit?: number;
  cursor?: string;
}

// ── Store Interface ──────────────────────────

export interface ConversationStore {
  create(input: CreateConversationInput): Promise<ConversationRecord>;
  getById(id: string): Promise<ConversationRecord | null>;
  listByUser(orgId: string, userId: string, options?: ListOptions): Promise<ConversationRecord[]>;
  /**
   * Search conversations belonging to (orgId, userId) where the title
   * OR any message content matches the query string. Case-insensitive
   * substring match. Returns the conversations ordered by `updatedAt
   * desc` so the sidebar can replace its local list directly.
   *
   * Used by the sidebar's search box: the pre-Wave-3 version
   * filtered the local conversation list by title only, which meant
   * that searching for content like "chargeback" found nothing
   * unless one of the conversation titles contained that word.
   */
  searchByContent(orgId: string, userId: string, query: string, limit?: number): Promise<ConversationRecord[]>;
  addMessage(conversationId: string, msg: CreateMessageInput): Promise<MessageRecord>;
  getMessages(conversationId: string, limit?: number): Promise<MessageRecord[]>;
  /** All messages from a conversation, ordered by createdAt asc, no limit. Used by fork. */
  getAllMessages(conversationId: string): Promise<MessageRecord[]>;
  updateTitle(id: string, title: string): Promise<void>;
  softDelete(id: string): Promise<void>;
  updateTotals(id: string, costDelta: number, inputDelta: number, outputDelta: number): Promise<void>;
}

// ── In-Memory Store (dev) ────────────────────

export class InMemoryConversationStore implements ConversationStore {
  private conversations = new Map<string, ConversationRecord>();
  private messages = new Map<string, MessageRecord[]>();
  private idCounter = 0;

  async create(input: CreateConversationInput): Promise<ConversationRecord> {
    const id = `conv_${++this.idCounter}`;
    const now = new Date();
    const record: ConversationRecord = {
      id,
      organizationId: input.organizationId,
      userId: input.userId,
      environmentId: input.environmentId || null,
      title: input.title || null,
      status: 'active',
      messageCount: 0,
      totalCostCents: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, record);
    this.messages.set(id, []);
    return record;
  }

  async getById(id: string): Promise<ConversationRecord | null> {
    const conv = this.conversations.get(id);
    if (!conv || conv.status === 'deleted') return null;
    return conv;
  }

  async listByUser(orgId: string, userId: string, options?: ListOptions): Promise<ConversationRecord[]> {
    const status = options?.status || 'active';
    const limit = options?.limit || 30;
    return Array.from(this.conversations.values())
      .filter((c) => c.organizationId === orgId && c.userId === userId && c.status === status)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async searchByContent(orgId: string, userId: string, query: string, limit = 30): Promise<ConversationRecord[]> {
    const q = query.toLowerCase();
    if (!q) return [];
    const matches: ConversationRecord[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.organizationId !== orgId || conv.userId !== userId || conv.status !== 'active') continue;
      const titleMatch = (conv.title || '').toLowerCase().includes(q);
      const msgs = this.messages.get(conv.id) || [];
      const contentMatch = msgs.some((m) => m.content.toLowerCase().includes(q));
      if (titleMatch || contentMatch) matches.push(conv);
    }
    return matches
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async addMessage(conversationId: string, msg: CreateMessageInput): Promise<MessageRecord> {
    const id = `msg_${++this.idCounter}`;
    const record: MessageRecord = {
      id,
      conversationId,
      role: msg.role,
      content: msg.content,
      model: msg.model || null,
      inputTokens: msg.inputTokens || null,
      outputTokens: msg.outputTokens || null,
      costCents: msg.costCents || null,
      toolCalls: msg.toolCalls || null,
      purpose: msg.purpose || null,
      createdAt: new Date(),
    };
    const list = this.messages.get(conversationId) || [];
    list.push(record);
    this.messages.set(conversationId, list);

    const conv = this.conversations.get(conversationId);
    if (conv) {
      conv.messageCount += 1;
      conv.updatedAt = new Date();
    }

    return record;
  }

  async getMessages(conversationId: string, limit = 50): Promise<MessageRecord[]> {
    const list = this.messages.get(conversationId) || [];
    return list.slice(-limit);
  }

  async getAllMessages(conversationId: string): Promise<MessageRecord[]> {
    return this.messages.get(conversationId) || [];
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const conv = this.conversations.get(id);
    if (conv) conv.title = title;
  }

  async softDelete(id: string): Promise<void> {
    const conv = this.conversations.get(id);
    if (conv) conv.status = 'deleted';
  }

  async updateTotals(id: string, costDelta: number, inputDelta: number, outputDelta: number): Promise<void> {
    const conv = this.conversations.get(id);
    if (conv) {
      conv.totalCostCents += costDelta;
    }
  }
}

// ── Prisma Store (production) ────────────────

export class PrismaConversationStore implements ConversationStore {
  constructor(private prisma: PrismaClient) {}

  async create(input: CreateConversationInput): Promise<ConversationRecord> {
    const row = await this.prisma.conversation.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        environmentId: input.environmentId || null,
        title: input.title || null,
      },
    });
    return toConversation(row);
  }

  async getById(id: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findFirst({
      where: { id, status: { not: 'deleted' } },
    });
    return row ? toConversation(row) : null;
  }

  async listByUser(orgId: string, userId: string, options?: ListOptions): Promise<ConversationRecord[]> {
    const status = options?.status || 'active';
    const limit = options?.limit || 30;

    const rows = await this.prisma.conversation.findMany({
      where: {
        organizationId: orgId,
        userId,
        status,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    return rows.map(toConversation);
  }

  async searchByContent(orgId: string, userId: string, query: string, limit = 30): Promise<ConversationRecord[]> {
    const q = query.trim();
    if (!q) return [];
    // Title-or-content match via Prisma OR + nested relation. The
    // `messages.some` filter compiles to a Postgres `EXISTS` subquery
    // — efficient enough for current scale (< 10k messages per user).
    // If this becomes a hotspot, the right next step is a Postgres
    // GIN index on `to_tsvector('simple', content)` and switching the
    // contains filter to a full-text-search predicate. For now ILIKE
    // is fine; it's the same complexity as the title fallback.
    const rows = await this.prisma.conversation.findMany({
      where: {
        organizationId: orgId,
        userId,
        status: 'active',
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { messages: { some: { content: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(toConversation);
  }

  async addMessage(conversationId: string, msg: CreateMessageInput): Promise<MessageRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: {
          conversationId,
          role: msg.role,
          content: msg.content,
          model: msg.model || null,
          inputTokens: msg.inputTokens || null,
          outputTokens: msg.outputTokens || null,
          costCents: msg.costCents || null,
          toolCalls: msg.toolCalls || null,
          purpose: msg.purpose || null,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { messageCount: { increment: 1 } },
      }),
    ]);
    return toMessage(row);
  }

  async getMessages(conversationId: string, limit = 50): Promise<MessageRecord[]> {
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toMessage);
  }

  async getAllMessages(conversationId: string): Promise<MessageRecord[]> {
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMessage);
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.prisma.conversation.update({ where: { id }, data: { title } });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: { status: 'deleted', deletedAt: new Date() },
    });
  }

  async updateTotals(id: string, costDelta: number, inputDelta: number, outputDelta: number): Promise<void> {
    // All three increments in a single Prisma update (atomic per-row)
    await this.prisma.conversation.update({
      where: { id },
      data: {
        totalCostCents: { increment: Math.round(costDelta * 10000) / 10000 },
        totalInputTokens: { increment: inputDelta },
        totalOutputTokens: { increment: outputDelta },
      },
    });
  }

  /** Atomic: add message + update totals in one transaction */
  async addMessageWithCost(
    conversationId: string,
    msg: CreateMessageInput,
    costDelta: number,
    inputTokensDelta: number,
    outputTokensDelta: number,
  ): Promise<MessageRecord> {
    const [msgRow] = await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: {
          conversationId,
          role: msg.role,
          content: msg.content,
          model: msg.model || null,
          inputTokens: msg.inputTokens || null,
          outputTokens: msg.outputTokens || null,
          costCents: msg.costCents || null,
          toolCalls: msg.toolCalls || null,
          purpose: msg.purpose || null,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          messageCount: { increment: 1 },
          totalCostCents: { increment: Math.round(costDelta * 10000) / 10000 },
          totalInputTokens: { increment: inputTokensDelta },
          totalOutputTokens: { increment: outputTokensDelta },
        },
      }),
    ]);
    return toMessage(msgRow);
  }
}

// ── Singleton ────────────────────────────────

let activeStore: ConversationStore = new InMemoryConversationStore();

export function setConversationStore(store: ConversationStore): void {
  activeStore = store;
}

export function getConversationStore(): ConversationStore {
  return activeStore;
}

// ── Helpers ──────────────────────────────────

function toConversation(row: any): ConversationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    environmentId: row.environmentId,
    title: row.title,
    status: row.status,
    messageCount: row.messageCount,
    totalCostCents: row.totalCostCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: any): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costCents: row.costCents,
    toolCalls: row.toolCalls,
    purpose: row.purpose,
    createdAt: row.createdAt,
  };
}
