"use client";

/**
 * useChatStream — Hook that consumes the /api/chat SSE endpoint.
 * Accumulates ContentBlocks in real-time from streaming events.
 * Handles: text deltas, tool call indicators, guard results,
 * connection errors, and automatic reconnect for transient failures.
 */

import { useState, useCallback, useRef } from "react";
import { parseBlockMarkers, resolveCardData } from "./chat-block-parser";
import type { ChatMessage, ContentBlock, ModelId, ToolCallBlock } from "./chat-types";

interface UseChatStreamOptions {
  onDone?: (response: any) => void;
  onError?: (message: string) => void;
  onPromptSuggestion?: (original: string, suggested: string, reason: string) => void;
}

interface UseChatStreamReturn {
  sendMessage: (
    message: string,
    model: ModelId,
    conversationId: string | null,
    conversationMessages: Array<{ role: string; content: string; timestamp: number }>,
    attachedFiles?: Array<{ name: string; type: string; content: string }>,
    /**
     * Total number of messages in the conversation as the client sees
     * it — distinct from `conversationMessages.length`, which is the
     * window of (up to) the last 50 messages sent to the LLM. The
     * server uses this to know how much history was truncated when
     * the conversation is longer than the window. Without it the
     * route silently underreports for long threads and the LLM
     * thinks the conversation is shorter than it actually is.
     */
    totalMessageCount?: number,
  ) => void;
  isStreaming: boolean;
  streamingMessage: ChatMessage | null;
  error: string | null;
  abort: () => void;
}

export function useChatStream(options?: UseChatStreamOptions): UseChatStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (
      message: string,
      model: ModelId,
      conversationId: string | null,
      conversationMessages: Array<{ role: string; content: string; timestamp: number }>,
      attachedFiles?: Array<{ name: string; type: string; content: string }>,
      totalMessageCount?: number,
    ) => {
      // Abort any existing stream
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setError(null);

      // Initialize streaming message
      const msgId = `msg_${Date.now()}`;
      const initialMessage: ChatMessage = {
        id: msgId,
        conversationId: conversationId || "ephemeral",
        role: "assistant",
        blocks: [],
        model,
        createdAt: new Date(),
        streaming: true,
      };
      setStreamingMessage(initialMessage);

      // Track current state for block accumulation
      let currentBlocks: ContentBlock[] = [];
      let currentText = "";
      let activeToolCalls = new Map<string, ToolCallBlock>();
      let updateScheduled = false;

      // Batched update: coalesce rapid state changes into a single React render
      function scheduleUpdate() {
        if (updateScheduled) return;
        updateScheduled = true;
        queueMicrotask(() => {
          updateScheduled = false;
          setStreamingMessage((prev) =>
            prev ? { ...prev, blocks: [...currentBlocks] } : null,
          );
        });
      }

      function flushText() {
        if (!currentText) return;

        // Parse rich block markers: $$FINDING{...}$$, $$ACTION{...}$$, $$IMPACT{...}$$
        const parsed = parseBlockMarkers(currentText);

        for (const segment of parsed) {
          if (segment.type === "markdown") {
            // Merge with last markdown block if possible
            const lastBlock = currentBlocks[currentBlocks.length - 1];
            if (lastBlock && lastBlock.type === "markdown") {
              (lastBlock as { type: "markdown"; content: string }).content += segment.content;
            } else if (segment.content.trim()) {
              currentBlocks.push(segment);
            }
          } else {
            currentBlocks.push(segment);
          }
        }

        currentText = "";
        scheduleUpdate();
      }

      try {
        const modelTier = model === "opus_4_6" ? "ultra" : "default";

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            model_tier: modelTier,
            conversation_id: conversationId,
            conversation_messages: conversationMessages.slice(-50),
            // Pass-through so the server knows the real conversation
            // length even after the 50-message window truncation.
            // Falls back to the slice length when undefined for
            // backwards compat with older callers.
            total_message_count: totalMessageCount ?? conversationMessages.length,
            ...(attachedFiles?.length ? { attached_files: attachedFiles } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Request failed" }));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete last line

          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            } else if (line === "" && eventType && eventData) {
              // Process complete event
              try {
                const data = JSON.parse(eventData);

                switch (eventType) {
                  case "guard":
                    if (!data.safe) {
                      // Guard blocked — show as error
                      setError(data.category === "prompt_injection"
                        ? "I can only analyze your business data."
                        : "I focus on commerce analysis.");
                    }
                    break;

                  case "tool_start": {
                    flushText();
                    const toolBlock: ToolCallBlock = {
                      type: "tool_call",
                      toolName: data.tool,
                      status: "running",
                      label: data.label,
                    };
                    activeToolCalls.set(data.tool, toolBlock);
                    currentBlocks.push(toolBlock);
                    scheduleUpdate();
                    break;
                  }

                  case "tool_done": {
                    const existing = activeToolCalls.get(data.tool);
                    if (existing) {
                      existing.status = "complete";
                      existing.resultPreview = data.summary?.slice(0, 300);
                    }
                    activeToolCalls.delete(data.tool);
                    scheduleUpdate();
                    break;
                  }

                  case "delta":
                    currentText += data.text;
                    // Flush periodically for smooth rendering
                    flushText();
                    break;

                  case "done":
                    flushText();
                    // Resolve finding/action/kb cards with real data from MCP
                    const resolvedBlocks = resolveCardData(
                      currentBlocks,
                      data.findings_data || {},
                      data.actions_data || {},
                      data.kb_articles_data || {},
                    );
                    currentBlocks = resolvedBlocks;
                    // Finalize message
                    setStreamingMessage((prev) =>
                      prev
                        ? {
                            ...prev,
                            blocks: resolvedBlocks,
                            streaming: false,
                            tokens: data.tokens,
                            costCents: data.cost_cents,
                          }
                        : null,
                    );
                    options?.onDone?.(data);
                    break;

                  case "error":
                    setError(data.message);
                    options?.onError?.(data.message);
                    break;

                  case "prompt_suggestion":
                    options?.onPromptSuggestion?.(data.original, data.suggested, data.reason);
                    break;
                }
              } catch {
                // Skip malformed events
              }

              eventType = "";
              eventData = "";
            }
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // User cancelled — not an error
        } else {
          const msg = err?.message || "Connection lost. Try again.";
          setError(msg);
          options?.onError?.(msg);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        // Mark streaming as done even on error
        setStreamingMessage((prev) =>
          prev ? { ...prev, streaming: false } : null,
        );
      }
    },
    [options],
  );

  return { sendMessage, isStreaming, streamingMessage, error, abort };
}

// Block marker parser + resolver moved to ./chat-block-parser so the
// server-side chat route can also import them and persist resolved
// blocks JSON to the database — see the comment at the top of that
// file for the full reasoning.
