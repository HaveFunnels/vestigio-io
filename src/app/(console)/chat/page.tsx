"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatMessageRenderer } from "@/components/console/chat/ChatMessageRenderer";
import { ConversationSidebar } from "@/components/console/chat/ConversationSidebar";
import { ChatInputBar } from "@/components/console/chat/ChatInputBar";
import { FileUploadZone, type UploadedFile } from "@/components/console/chat/FileUploadZone";
// ChatBudgetBar removed — usage shown as radial indicator in ChatInputBar
import { parseBlockMarkers } from "@/lib/chat-block-parser";
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

// Hydrated context item — what the indicator above the editor renders.
// Built by POSTing the raw {kind, id} pairs from URL params to
// /api/chat/context-items, which resolves them through the in-memory
// MCP projections so we get titles + severity + impact in one batched
// round trip. Items that don't resolve are dropped silently (the user
// just won't see them in the bar).
type ChatContextKind = "finding" | "action" | "workspace" | "surface";
interface ChatContextItem {
  kind: ChatContextKind;
  id: string;
  title: string;
  severity?: string;
  impact_mid?: number;
  pack?: string;
}

export default function ChatPage() {
  const router = useRouter();
  const t = useTranslations("console.chat");
  const tc = useTranslations("console.common");

  // ── State ──────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Active conversation ID is persisted to localStorage (NOT sessionStorage)
  // so it survives logout/login. The pre-Wave 2 implementation used
  // sessionStorage, which the browser clears when the auth session ends —
  // so users coming back to the app saw an empty chat page even though
  // their conversations were intact in the database. The auto-restore
  // useEffect below also picks the most recent conversation when no
  // stored ID is present, so a brand-new login lands on the user's
  // latest conversation instead of an empty state.
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vestigio_active_conv") || null;
    }
    return null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelId>("sonnet_4_6");
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [questionQueue, setQuestionQueue] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [playbooksOpen, setPlaybooksOpen] = useState(false);
  const [contextItems, setContextItems] = useState<ChatContextItem[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

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
    // Modern persistence: assistant messages are stored as
    // JSON.stringify(ContentBlock[]) — fully resolved cards included.
    // This is the fast path and what every message saved after Wave 2
    // uses. JSON.parse + an Array.isArray sanity check is enough.
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON — fall through */ }
    // Legacy fallback: messages persisted before the server-side
    // resolver shipped still have raw `$$MARKER{...}$$` text. Run the
    // marker parser on them so cards at least render with placeholder
    // titles instead of literal "$$FINDING{abc123}$$" strings. The
    // metadata won't be hydrated (we don't have findings_data /
    // actions_data on a cold restore) so cards show generic titles +
    // links — strictly better than the raw markers.
    return parseBlockMarkers(content);
  }

  // ── Persist active conversation ID ─────────
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem("vestigio_active_conv", activeConversationId);
    } else {
      localStorage.removeItem("vestigio_active_conv");
    }
  }, [activeConversationId]);

  // ── Init ───────────────────────────────────
  // Two-step restore:
  //   1. If localStorage has a stored conversation id, try to load it.
  //      That covers normal "return to chat" flow inside the same login.
  //   2. If no id is stored (first login, or after the user explicitly
  //      cleared with handleNewChat), wait until /api/conversations
  //      resolves and auto-select the most recent non-deleted thread.
  //      This is what makes "log out, log back in" land on the user's
  //      latest conversation instead of an empty page even when the
  //      browser cleared every storage layer.
  useEffect(() => {
    fetchUsage();
    fetchConversations();
    const stored = localStorage.getItem("vestigio_active_conv");
    if (stored && messages.length === 0) {
      loadConversation(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-restore most recent conversation ──
  // Fires once after fetchConversations() lands and only when nothing
  // else has populated the chat yet. Picks the first conversation in
  // the list (the API returns them ordered by updatedAt desc, see
  // src/app/api/conversations/route.ts) so the user reliably lands on
  // the thread they were last working on. Conditional on
  // `messages.length === 0` so it never overrides an in-progress chat.
  //
  // **Race-condition guard:** if the URL carries context params, the
  // user is intentionally starting a NEW context-aware chat — we must
  // NOT auto-restore an old one and overwrite it. The URL effect
  // above is async (it hydrates context metadata before calling
  // handleSend) so there's a window where `activeConversationId` is
  // still null and `messages` is still empty even though a new chat
  // is about to be created. We sidestep that by checking the URL
  // params directly here too.
  useEffect(() => {
    if (activeConversationId) return;
    if (messages.length > 0) return;
    if (conversations.length === 0) return;
    if (
      searchParams.get("finding") ||
      searchParams.get("findings") ||
      searchParams.get("action") ||
      searchParams.get("context") ||
      searchParams.get("surfaces")
    ) {
      return;
    }
    const mostRecent = conversations[0];
    if (mostRecent?.id) {
      loadConversation(mostRecent.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  // ── Read URL context params, hydrate metadata, then auto-send ──
  // Entry points across the console (Discuss, Analyze together, Use
  // as context) navigate here with raw IDs in the URL. The legacy
  // implementation passed the IDs directly to the LLM as text and
  // showed only a "1 item" counter — operators couldn't see WHICH
  // finding was attached. The new flow:
  //
  //   1. Parse all known param shapes into a {kind, id}[] list.
  //      Different entry points use different param names (`finding`,
  //      `findings`, `action`, `context`, `surfaces`, plus a
  //      `workspaces:` prefix from the workspaces page) — all are
  //      normalised here.
  //   2. POST the list to /api/chat/context-items, which hydrates
  //      title + severity + impact from the in-memory MCP projections
  //      in one batched round trip.
  //   3. Set the rich items into state so the indicator bar above
  //      the editor can render proper chips.
  //   4. Auto-send the initial prompt as before, but now the prompt
  //      can interpolate the resolved titles instead of raw IDs so
  //      the LLM has the human-friendly context too.
  //
  // The context PERSISTS across follow-up messages — clicking "×" on
  // a chip is the only way to remove an item. This matches the user
  // mental model that "discussing finding X" is a sticky property of
  // the conversation, not a one-shot lookup that vanishes after the
  // first reply.
  useEffect(() => {
    const finding = searchParams.get("finding");
    const findings = searchParams.get("findings");
    const action = searchParams.get("action");
    const context = searchParams.get("context");
    const surfaces = searchParams.get("surfaces");

    const raw: Array<{ kind: ChatContextKind; id: string }> = [];
    if (finding) {
      raw.push({ kind: "finding", id: finding });
    }
    if (findings) {
      for (const id of findings.split(",").map((s) => s.trim()).filter(Boolean)) {
        raw.push({ kind: "finding", id });
      }
    }
    if (action) {
      raw.push({ kind: "action", id: action });
    }
    if (surfaces) {
      for (const id of surfaces.split(",").map((s) => s.trim()).filter(Boolean)) {
        raw.push({ kind: "surface", id });
      }
    }
    if (context) {
      // Two flavours: `?context=workspaces:id1,id2` (workspaces page)
      // and `?context=id1,id2` (inventory page, plain finding IDs).
      // The `?context=maps` literal from the maps page has no items
      // to hydrate — it just opens the chat with no specific context.
      if (context === "maps") {
        // No items, no hydration — fall through.
      } else if (context.startsWith("workspaces:")) {
        const list = context.slice("workspaces:".length);
        for (const id of list.split(",").map((s) => s.trim()).filter(Boolean)) {
          raw.push({ kind: "workspace", id });
        }
      } else {
        for (const id of context.split(",").map((s) => s.trim()).filter(Boolean)) {
          raw.push({ kind: "finding", id });
        }
      }
    }

    if (raw.length === 0) {
      // No URL context — nothing to hydrate, nothing to auto-send.
      return;
    }

    // Hydrate metadata via the batched endpoint, then set state and
    // auto-send a context-aware initial prompt. We construct the
    // prompt from the hydrated titles so the LLM sees human-readable
    // names AND the IDs (so its tools can resolve them deterministically).
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/context-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: raw }),
        });
        if (!res.ok) throw new Error("hydration failed");
        const data = await res.json();
        const hydrated: ChatContextItem[] = Array.isArray(data.items) ? data.items : [];
        if (cancelled) return;
        setContextItems(hydrated);

        // Build the initial prompt. If hydration came back empty (the
        // engine no longer knows about these IDs), we still send a
        // prompt referring to the raw IDs as a fallback so the user
        // gets *something* — but the indicator stays empty.
        const items = hydrated.length > 0 ? hydrated : raw.map((r) => ({
          kind: r.kind,
          id: r.id,
          title: r.id,
        } as ChatContextItem));
        handleSend(buildContextPrompt(items));
      } catch {
        // Hydration unavailable — fall back to the legacy behaviour
        // so the user still gets a response. The indicator just stays
        // empty in this branch.
        if (cancelled) return;
        const placeholders: ChatContextItem[] = raw.map((r) => ({
          kind: r.kind,
          id: r.id,
          title: r.id,
        }));
        setContextItems(placeholders);
        handleSend(buildContextPrompt(placeholders));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Remove a single context item from the chip bar.
  function handleRemoveContextItem(id: string, kind: ChatContextKind) {
    setContextItems((prev) => prev.filter((it) => !(it.id === id && it.kind === kind)));
  }
  function handleClearAllContext() {
    setContextItems([]);
  }

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
            <div className="mx-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 sm:mx-6">
              <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="flex-1 text-xs text-amber-400/80">{t("setupBanner.prefix")} <button onClick={() => router.push("/app/onboarding")} className="underline hover:text-amber-300">{t("setupBanner.setupLink")}</button> {t("setupBanner.suffix")}</p>
            </div>
          )}

          {/* Top bar with history toggle + title + playbooks toggle */}
          <div className="flex items-center gap-3 px-4 py-2 sm:px-6">
            {/* History toggle (visible when sidebar is collapsed) */}
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-edge text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
                title="Show conversations"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-semibold text-content">{t("title")}</h1>
              <span className="relative inline-flex group">
                <button
                  type="button"
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-edge/60 text-[8px] font-semibold text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted"
                  aria-label="Page info"
                >
                  ?
                </button>
                <div className="pointer-events-none absolute left-6 top-0 z-50 w-56 rounded-lg border border-edge bg-surface-card px-3 py-2 text-[11px] leading-relaxed text-content-secondary opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  {tc("page_tooltips.chat")}
                </div>
              </span>
            </div>

            <div className="flex-1" />
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
          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
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

          {/* Context indicator — rich chip bar attached to the editor */}
          {contextItems.length > 0 && (
            <ContextIndicator
              items={contextItems}
              onRemove={handleRemoveContextItem}
              onClearAll={handleClearAllContext}
            />
          )}

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
                  onClick={() => { handleSend(t.has(`playbook_prompts.${pb.id}`) ? t(`playbook_prompts.${pb.id}`) : pb.prompt); setPlaybooksOpen(false); }}
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

// ── Context Indicator (chip bar above the editor) ──────────
//
// Renders one chip per attached context item, anchored to the top
// edge of the chat input island so the user always sees what the
// next message will be discussed against. Each chip carries a
// kind-coloured icon, the resolved title (truncated), and a per-item
// remove button. When more than one item is attached, a "clear all"
// affordance appears at the right edge of the bar.
//
// The visual language matches Vestigio's existing chip pattern (used
// for attached files in ChatInputBar) so the bar feels native to the
// island below it instead of a separate banner.

const CONTEXT_KIND_LABELS: Record<ChatContextKind, string> = {
  finding: "Finding",
  action: "Action",
  workspace: "Workspace",
  surface: "Surface",
};

const CONTEXT_KIND_STYLES: Record<ChatContextKind, { chip: string; icon: string }> = {
  finding: {
    chip: "border-red-700/40 bg-red-500/10 text-red-300 hover:border-red-600/60",
    icon: "text-red-400",
  },
  action: {
    chip: "border-emerald-700/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-600/60",
    icon: "text-emerald-400",
  },
  workspace: {
    chip: "border-violet-700/40 bg-violet-500/10 text-violet-300 hover:border-violet-600/60",
    icon: "text-violet-400",
  },
  surface: {
    chip: "border-cyan-700/40 bg-cyan-500/10 text-cyan-300 hover:border-cyan-600/60",
    icon: "text-cyan-400",
  },
};

function ContextKindIcon({ kind, className }: { kind: ChatContextKind; className?: string }) {
  if (kind === "finding") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  if (kind === "action") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    );
  }
  if (kind === "workspace") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function ContextIndicator({
  items,
  onRemove,
  onClearAll,
}: {
  items: ChatContextItem[];
  onRemove: (id: string, kind: ChatContextKind) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex items-start gap-2 border-t border-edge bg-surface-card/40 px-4 py-2 sm:px-6">
      <div className="flex shrink-0 items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
        <svg className="h-3 w-3 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
        Context
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {items.map((item) => {
          const styles = CONTEXT_KIND_STYLES[item.kind];
          const label = CONTEXT_KIND_LABELS[item.kind];
          return (
            <div
              key={`${item.kind}:${item.id}`}
              className={`group flex max-w-[260px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${styles.chip}`}
              title={`${label}: ${item.title}`}
            >
              <ContextKindIcon kind={item.kind} className={`h-3 w-3 shrink-0 ${styles.icon}`} />
              <span className="truncate font-medium">{item.title}</span>
              <button
                type="button"
                onClick={() => onRemove(item.id, item.kind)}
                className="ml-0.5 -mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-current opacity-60 transition-opacity hover:opacity-100"
                aria-label={`Remove ${label.toLowerCase()} from context`}
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none">
                  <path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      {items.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="shrink-0 self-start rounded px-1.5 py-1 text-[10px] text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// Build the auto-send prompt that pre-populates the chat when the
// user lands here from a "Discuss" / "Use as context" CTA. The
// resolved titles are interpolated so the LLM sees human-readable
// names; the IDs come along too so internal tools can resolve them
// deterministically. The prompt shape mirrors the legacy phrasings
// so the LLM playbooks that key off "discuss finding" / "analyze
// these N findings" / "use these items as context" still trigger.
function buildContextPrompt(items: ChatContextItem[]): string {
  if (items.length === 0) {
    return "Give me a summary of what you see.";
  }
  if (items.length === 1) {
    const it = items[0];
    if (it.kind === "finding") {
      return `Discuss finding "${it.title}" (${it.id}). Explain the root cause, impact, and what to fix.`;
    }
    if (it.kind === "action") {
      return `Discuss action "${it.title}" (${it.id}). Why does it matter, what's the expected lift, and how should I sequence it?`;
    }
    if (it.kind === "workspace") {
      return `Discuss the "${it.title}" workspace. Walk me through what's happening there and what to do about it.`;
    }
    return `Discuss surface ${it.title}. What findings touch it and what should I prioritise?`;
  }

  const findings = items.filter((i) => i.kind === "finding");
  const actions = items.filter((i) => i.kind === "action");
  const workspaces = items.filter((i) => i.kind === "workspace");
  const surfaces = items.filter((i) => i.kind === "surface");

  const parts: string[] = [];
  if (findings.length > 0) {
    parts.push(
      `${findings.length} findings (${findings.map((f) => `"${f.title}"`).join(", ")})`,
    );
  }
  if (actions.length > 0) {
    parts.push(
      `${actions.length} actions (${actions.map((a) => `"${a.title}"`).join(", ")})`,
    );
  }
  if (workspaces.length > 0) {
    parts.push(
      `${workspaces.length} workspaces (${workspaces.map((w) => `"${w.title}"`).join(", ")})`,
    );
  }
  if (surfaces.length > 0) {
    parts.push(
      `${surfaces.length} surfaces (${surfaces.map((s) => s.title).join(", ")})`,
    );
  }

  return `Analyze these together: ${parts.join(", ")}. What do they have in common? What's the combined impact and the single highest-leverage fix?`;
}

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
