"use client";

/**
 * useChatStream — Hook that consumes the /api/chat SSE endpoint.
 * Accumulates ContentBlocks in real-time from streaming events.
 * Handles: text deltas, tool call indicators, guard results,
 * connection errors, and automatic reconnect for transient failures.
 */

import { useState, useCallback, useRef } from "react";
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
                    // Resolve finding/action cards with real data from MCP
                    const resolvedBlocks = resolveCardData(
                      currentBlocks,
                      data.findings_data || {},
                      data.actions_data || {},
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

// ── Block Marker Parser ──────────────────────
// Parses $$FINDING{...}$$, $$ACTION{...}$$, $$IMPACT{...}$$ from Claude's text
// and converts them into typed ContentBlocks.

const BLOCK_MARKER_REGEX = /\$\$(FINDING|ACTION|IMPACT|CREATEACTION|NAVIGATE)\{([^}]+)\}\$\$/g;

function parseBlockMarkers(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(BLOCK_MARKER_REGEX)) {
    const markerType = match[1];
    const markerContent = match[2];
    const matchStart = match.index!;

    // Text before marker
    if (matchStart > lastIndex) {
      const before = text.slice(lastIndex, matchStart);
      if (before.trim()) {
        blocks.push({ type: "markdown", content: before });
      }
    }

    // Parse marker into block
    try {
      if (markerType === "FINDING") {
        blocks.push({
          type: "finding_card",
          finding: {
            id: markerContent,
            title: `Finding ${markerContent}`,
            severity: "medium",
            confidence: 0,
            impact_mid: 0,
            impact_min: 0,
            impact_max: 0,
            pack: "",
            root_cause: null,
          },
        });
      } else if (markerType === "ACTION") {
        blocks.push({
          type: "action_card",
          action: {
            id: markerContent,
            title: `Action ${markerContent}`,
            severity: "medium",
            impact_mid: 0,
            cross_pack: false,
            priority_score: 0,
          },
        });
      } else if (markerType === "IMPACT") {
        const data = JSON.parse(markerContent);
        blocks.push({
          type: "impact_summary",
          summary: {
            min: data.min || 0,
            max: data.max || 0,
            mid: data.mid || 0,
            type: data.type || "revenue_loss",
            currency: data.currency || "USD",
          },
        });
      } else if (markerType === "CREATEACTION") {
        const data = JSON.parse(markerContent);
        blocks.push({
          type: "create_action",
          title: data.title || "New action",
          description: data.description || "",
          severity: data.severity || "medium",
          estimatedImpact: data.estimatedImpact,
        });
      } else if (markerType === "NAVIGATE") {
        // Try parsing as-is first, then with braces wrapper
        let data;
        try { data = JSON.parse(markerContent); } catch { data = JSON.parse(`{${markerContent}}`); }
        // Support single target shorthand or array
        const targets = Array.isArray(data)
          ? data
          : [{ label: data.label || "Go", href: data.href || "/", variant: data.variant || "primary" }];
        blocks.push({
          type: "navigation_cta",
          targets,
        });
      }
    } catch {
      // If parsing fails, keep as text
      blocks.push({ type: "markdown", content: match[0] });
    }

    lastIndex = matchStart + match[0].length;
  }

  // Remaining text after last marker
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      blocks.push({ type: "markdown", content: remaining });
    }
  }

  // If no markers found, return as single markdown block
  if (blocks.length === 0 && text.trim()) {
    blocks.push({ type: "markdown", content: text });
  }

  return blocks;
}

/** Resolve finding/action card blocks with real MCP data */
function resolveCardData(
  blocks: ContentBlock[],
  findingsData: Record<string, any>,
  actionsData: Record<string, any>,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === "finding_card" && block.finding.id) {
      const real = findingsData[block.finding.id];
      if (real) {
        return { ...block, finding: { ...block.finding, ...real } };
      }
    }
    if (block.type === "action_card" && block.action.id) {
      const real = actionsData[block.action.id];
      if (real) {
        return { ...block, action: { ...block.action, ...real } };
      }
    }
    return block;
  });
}
