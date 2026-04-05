"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatMessageRenderer } from "@/components/console/chat/ChatMessageRenderer";
import { ConversationSidebar } from "@/components/console/chat/ConversationSidebar";
import { ChatInputBar } from "@/components/console/chat/ChatInputBar";
import { FileUploadZone, type UploadedFile } from "@/components/console/chat/FileUploadZone";
// ChatBudgetBar removed — usage shown as radial indicator in ChatInputBar
import { useChatStream } from "@/lib/use-chat-stream";
import type { ChatMessage, ContentBlock, ModelId, Conversation } from "@/lib/chat-types";

// ──────────────────────────────────────────────
// Chat Page — Claude LLM + MCP Tools
//
// Layout: ConversationSidebar (left) + Chat (center)
// Features: SSE streaming, tool call indicators,
//   rich content blocks, conversation history,
//   model selector (Default / Ultra)
// ──────────────────────────────────────────────

interface UsageState {
  mcp_used: number;
  mcp_limit: number;
  mcp_remaining: number;
  mcp_pct: number;
  plan: string;
  domain: string | null;
  envId: string | null;
}

export default function ChatPage() {
  const router = useRouter();
  const t = useTranslations("console.chat");

  // ── State ──────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelId>("sonnet_4_6");
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [questionQueue, setQuestionQueue] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [playbooksOpen, setPlaybooksOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Streaming hook ─────────────────────────
  const { sendMessage, isStreaming, streamingMessage, error, abort } = useChatStream({
    onDone: (data) => {
      // Refresh usage after each message
      fetchUsage();
      // Process question queue
      setQuestionQueue((prev) => {
        if (prev.length > 0) {
          const [next, ...rest] = prev;
          // Schedule next question after a short delay
          setTimeout(() => handleSend(next), 500);
          return rest;
        }
        return prev;
      });
    },
  });

  // ── Fetch usage ────────────────────────────
  async function fetchUsage() {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const data = await res.json();
        setUsage({
          mcp_used: data.usage?.mcp_queries || 0,
          mcp_limit: data.limits?.daily_mcp_budget || 5,
          mcp_remaining: data.mcp_remaining ?? 5,
          mcp_pct: data.mcp_pct ?? 0,
          plan: data.plan || "vestigio",
          domain: data.domain || null,
          envId: data.envId || null,
        });
      }
    } catch { /* continue without usage data */ }
  }

  // ── Fetch conversations ────────────────────
  async function fetchConversations() {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch { /* continue */ }
  }

  // ── Load conversation messages ─────────────
  async function loadConversation(conversationId: string) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}?message_limit=50`);
      if (res.ok) {
        const data = await res.json();
        const loaded: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role,
          blocks: parseBlocks(m.content, m.role),
          model: m.model || undefined,
          createdAt: new Date(m.createdAt),
        }));
        setMessages(loaded);
        setActiveConversationId(conversationId);
      }
    } catch { /* continue */ }
  }

  function parseBlocks(content: string, role: string): ContentBlock[] {
    if (role === "user") {
      return [{ type: "markdown", content }];
    }
    // Try parsing as JSON ContentBlock array, fallback to markdown
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON */ }
    return [{ type: "markdown", content }];
  }

  // ── Init ───────────────────────────────────
  useEffect(() => {
    fetchUsage();
    fetchConversations();
  }, []);

  // ── Auto-scroll (only when there are messages) ──
  useEffect(() => {
    if (messages.length > 0 || streamingMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingMessage]);

  // ── Create new conversation ────────────────
  async function createConversation(): Promise<string | null> {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const conv = data.conversation;
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        return conv.id;
      }
    } catch { /* continue */ }
    return null;
  }

  // ── Handle new chat ────────────────────────
  function handleNewChat() {
    setActiveConversationId(null);
    setMessages([]);
  }

  // ── Handle send message ────────────────────
  const handleSend = useCallback(async (text: string) => {
    if (isStreaming) {
      // Queue the question for after current stream completes
      setQuestionQueue((prev) => [...prev, text]);
      return;
    }

    // Ensure we have a conversation
    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation();
    }

    // Auto-title from first message
    if (convId && messages.length === 0) {
      const title = text.slice(0, 60) + (text.length > 60 ? "..." : "");
      fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).then(() => fetchConversations()).catch(() => {});
    }

    // Add user message to UI
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      conversationId: convId || "ephemeral",
      role: "user",
      blocks: [{ type: "markdown", content: text }],
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Build conversation history for context
    const history = messages.map((m) => ({
      role: m.role,
      content: m.blocks
        .filter((b): b is { type: "markdown"; content: string } => b.type === "markdown")
        .map((b) => b.content)
        .join("\n") || "",
      timestamp: m.createdAt.getTime(),
    }));

    // Send to streaming API
    sendMessage(text, selectedModel, convId, history, attachedFiles.length > 0 ? attachedFiles : undefined);
  }, [isStreaming, activeConversationId, messages, selectedModel, sendMessage]);

  // ── Merge streaming message into messages ──
  useEffect(() => {
    if (streamingMessage && !streamingMessage.streaming) {
      // Stream complete — add to message list
      setMessages((prev) => [...prev, { ...streamingMessage, streaming: false }]);
    }
  }, [streamingMessage?.streaming]);

  // ── Handle suggested prompt click ──────────
  function handleSuggestedPrompt(prompt: string) {
    handleSend(prompt);
  }

  // ── Handle navigation from cards ───────────
  function handleNavigate(href: string) {
    router.push(href);
  }

  // ── Delete conversation ────────────────────
  async function handleDeleteConversation(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch { /* continue */ }
  }

  // ── Message action handlers ────────────────

  function handleRetry() {
    // Retry = resend the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const text = lastUserMsg.blocks
        .filter((b): b is { type: "markdown"; content: string } => b.type === "markdown")
        .map((b) => b.content)
        .join("\n");
      // Remove the last assistant response
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
      if (text) handleSend(text);
    }
  }

  function handleEdit(newContent: string) {
    // Re-send with edited content, removing everything after the edited message
    handleSend(newContent);
  }

  function handleFeedback(messageId: string, rating: "positive" | "negative", comment?: string) {
    // Find the message to get preview text
    const msg = messages.find((m) => m.id === messageId);
    const preview = msg?.blocks
      .filter((b): b is { type: "markdown"; content: string } => b.type === "markdown")
      .map((b) => b.content)
      .join(" ")
      .slice(0, 200);

    fetch("/api/chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId,
        rating,
        comment,
        conversationId: activeConversationId,
        messagePreview: preview,
        model: msg?.model,
      }),
    }).catch(() => {});
  }

  function handleSaveAction(action: { title: string; description: string; severity: string; estimatedImpact?: number }) {
    // Save the user-discovered action — fire-and-forget
    fetch("/api/chat/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...action, conversationId: activeConversationId }),
    }).catch(() => {});
  }

  // ── Compute all messages including streaming ──
  const allMessages = streamingMessage?.streaming
    ? [...messages, streamingMessage]
    : messages;

  const budgetExhausted = usage ? usage.mcp_remaining <= 0 : false;

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Conversation Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={loadConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={async (id, title) => {
          try {
            await fetch(`/api/conversations/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            });
            fetchConversations();
          } catch { /* continue */ }
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Chat Area */}
      <FileUploadZone onFilesAdded={(files) => setAttachedFiles((prev) => [...prev, ...files].slice(0, 3))}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Center column: messages + input */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Setup banner (non-blocking) */}
          {usage && !usage.domain && (
            <div className="mx-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 sm:mx-8">
              <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="flex-1 text-xs text-amber-400/80">{t("setupBanner.prefix")} <button onClick={() => router.push("/app/onboarding")} className="underline hover:text-amber-300">{t("setupBanner.setupLink")}</button> {t("setupBanner.suffix")}</p>
            </div>
          )}

          {/* Top bar with playbooks toggle */}
          <div className="flex items-center justify-end px-4 py-1.5 sm:px-8">
            <button
              onClick={() => setPlaybooksOpen(!playbooksOpen)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                playbooksOpen
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "border-edge bg-surface-card text-content-secondary hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-600 dark:hover:text-emerald-400"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              {t("playbooks.label")}
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
            <div className="mx-auto max-w-3xl space-y-4">
              {allMessages.length === 0 && !isStreaming && (
                <EmptyState onSuggest={handleSend} />
              )}

              {allMessages.map((msg) => (
                <ChatMessageRenderer
                  key={msg.id}
                  message={msg}
                  onSuggestedPrompt={handleSuggestedPrompt}
                  onNavigate={handleNavigate}
                  onRetry={handleRetry}
                  onEdit={handleEdit}
                  onFeedback={handleFeedback}
                  onSaveAction={handleSaveAction}
                />
              ))}

              {/* Error display */}
              {error && !isStreaming && (
                <div className="rounded-md border border-red-800/30 bg-red-500/5 px-4 py-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Question queue indicator */}
              {questionQueue.length > 0 && (
                <div className="text-center">
                  <span className="text-[10px] text-content-faint">
                    {t("queue.followUps", { count: questionQueue.length })}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <ChatInputBar
            onSend={(text) => {
              handleSend(text);
              setAttachedFiles([]); // Clear files after send
            }}
            disabled={budgetExhausted}
            plan={usage?.plan || "vestigio"}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            attachedFiles={attachedFiles}
            onRemoveFile={(idx) => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
            mcpPct={usage?.mcp_pct ?? 0}
            mcpUsed={usage?.mcp_used ?? 0}
            mcpLimit={usage?.mcp_limit ?? 0}
            placeholder={
              budgetExhausted
                ? t("input.budgetExhausted")
                : isStreaming
                  ? t("input.analyzing")
                  : undefined
            }
          />
        </div>

        {/* Playbooks Right Drawer */}
        <div
          className={`shrink-0 overflow-hidden border-l border-edge bg-surface-inset transition-all duration-300 ${
            playbooksOpen ? "w-80" : "w-0 border-l-0"
          }`}
        >
          <div className="flex h-full w-80 flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">{t("playbooks.label")}</span>
              <button
                onClick={() => setPlaybooksOpen(false)}
                className="rounded p-1 text-content-muted hover:bg-surface-card-hover hover:text-content-secondary"
                title={t("playbooks.close")}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {FEATURED_PLAYBOOKS.map((pb) => (
                <button
                  key={pb.id}
                  onClick={() => { handleSend(pb.prompt); setPlaybooksOpen(false); }}
                  className={`group flex w-full flex-col rounded-lg border bg-surface-card/30 p-3.5 text-left transition-all ${FEATURED_COLORS[pb.color] || FEATURED_COLORS.emerald}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${FEATURED_BADGE_COLORS[pb.color] || FEATURED_BADGE_COLORS.emerald}`}>
                      {pb.category}
                    </span>
                    <span className="text-[10px] text-content-faint">{t("playbooks.queries", { count: pb.queries })}</span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-medium text-content-secondary group-hover:text-content">
                    {pb.title}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-content-muted line-clamp-2">
                    {pb.description}
                  </p>
                  <div className="mt-auto flex items-center justify-end pt-2">
                    <span className="text-[10px] text-content-faint transition-colors group-hover:text-emerald-500">
                      {t("playbooks.usePrompt")} &rarr;
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      </FileUploadZone>
    </div>
  );
}

// ── Empty State ──────────────────────────────

const QUICK_PRESETS = [
  { text: "Where am I losing money?", label: "Revenue leaks" },
  { text: "Can I safely scale paid traffic?", label: "Scale readiness" },
  { text: "What should I fix first?", label: "Priority actions" },
  { text: "What's my chargeback risk?", label: "Chargeback exposure" },
  { text: "What changed since last analysis?", label: "Recent changes" },
  { text: "Are there any regressions?", label: "Regressions" },
];

// Curated playbooks for empty state — 1 per category, most accessible
const FEATURED_PLAYBOOKS: Array<{
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  color: string;
  queries: number;
}> = [
  {
    id: 'revenue_leak_full_audit',
    title: 'Full Revenue Leak Audit',
    description: 'Complete analysis of where money exits your funnel, ranked by $ impact.',
    prompt: 'Run a complete revenue leak analysis. Show me every finding that causes revenue loss, ranked by monthly dollar impact from highest to lowest. For the top 5, explain the root cause and what fixing each one would recover. Then show the total combined monthly loss and the estimated recovery if I fix the top 3.',
    category: 'Revenue',
    color: 'red',
    queries: 2,
  },
  {
    id: 'conversion_bottleneck',
    title: 'Conversion Bottleneck Map',
    description: 'Where visitors drop off and why — with the single highest-leverage fix.',
    prompt: 'Map my conversion funnel from landing to purchase/signup. At each stage, show which findings create friction. Where is the biggest single drop-off? What\'s the root cause of that drop-off? If I could only fix one thing to improve conversion, what should it be and how much would it move the needle?',
    category: 'Conversion',
    color: 'emerald',
    queries: 3,
  },
  {
    id: 'trust_signal_audit',
    title: 'Trust Signal Audit',
    description: 'Score your credibility across 7 dimensions with actionable gaps.',
    prompt: 'Score my site\'s trust signals across these dimensions: SSL & security badges, reviews & testimonials, company information (about, team, address), contact options (phone, chat, email), policies (returns, privacy, terms), payment trust (logos, guarantees), social proof (customer count, media mentions). For each dimension, rate 1-10 and explain what\'s missing. What\'s my overall trust score and what would improve it fastest?',
    category: 'Trust',
    color: 'violet',
    queries: 2,
  },
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    description: 'Board-ready overview: total risk, top priorities, 90-day roadmap.',
    prompt: 'Create an executive summary suitable for a board meeting. Include: total monthly revenue at risk (sum of all findings), top 3 critical issues with dollar impact, 90-day priority roadmap (week 1-2: quick wins, month 1: critical fixes, month 2-3: strategic improvements), expected ROI of the full remediation plan, and a single "health score" from 0-100 for the business.',
    category: 'Strategy',
    color: 'amber',
    queries: 3,
  },
  {
    id: 'cross_pack_correlation',
    title: 'Cross-Pack Correlation',
    description: 'Hidden connections between findings from different analysis packs.',
    prompt: 'Analyze findings across ALL packs (revenue integrity, scale readiness, chargeback resilience). Find correlations: Which findings from different packs share the same root cause? Where does fixing a revenue issue also reduce chargeback risk? Where does improving trust also help conversion? Build a correlation map showing connected findings across packs with combined impact.',
    category: 'Insights',
    color: 'cyan',
    queries: 3,
  },
];

const FEATURED_COLORS: Record<string, string> = {
  red: 'border-red-800/30 hover:border-red-700/50 hover:bg-red-500/5',
  emerald: 'border-emerald-800/30 hover:border-emerald-700/50 hover:bg-emerald-500/5',
  violet: 'border-violet-800/30 hover:border-violet-700/50 hover:bg-violet-500/5',
  amber: 'border-amber-800/30 hover:border-amber-700/50 hover:bg-amber-500/5',
  cyan: 'border-cyan-800/30 hover:border-cyan-700/50 hover:bg-cyan-500/5',
};

const FEATURED_BADGE_COLORS: Record<string, string> = {
  red: 'bg-red-500/10 text-red-400 border-red-700/30',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/30',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-700/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-700/30',
  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-700/30',
};

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  const t = useTranslations("console.chat");
  return (
    <div className="flex flex-col items-center justify-center py-16">
      {/* Logo mark */}
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-700/30 bg-emerald-500/10">
        <svg className="h-6 w-6 text-emerald-400" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-content-secondary">
        {t("emptyState.title")}
      </h2>
      <p className="mt-1 max-w-sm text-center text-sm text-content-muted">
        {t("emptyState.description")}
      </p>

      {/* Quick questions — only first 3 */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        {QUICK_PRESETS.slice(0, 3).map((p) => (
          <button
            key={p.text}
            onClick={() => onSuggest(p.text)}
            className="rounded-lg border border-edge px-3 py-2 text-center text-[13px] text-content-tertiary transition-colors hover:border-emerald-600/50 hover:text-emerald-400"
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-[10px] text-content-faint">
        {t("emptyState.playbooksHint")}
      </p>
    </div>
  );
}
