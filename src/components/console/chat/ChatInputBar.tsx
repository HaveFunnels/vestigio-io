"use client";

/**
 * ChatInputBar — Input area with model selector, voice input, file chips,
 * send button, stop-generating button, and Shift+Enter support.
 */

import { useState, useRef, useEffect } from "react";
import type { ModelId } from "@/lib/chat-types";
import { ModelSelector } from "./ModelSelector";
import { VoiceInput } from "./VoiceInput";
import { FileChip, processFileList, type UploadedFile } from "./FileUploadZone";

interface ChatInputBarProps {
  onSend: (message: string, attachedFiles?: UploadedFile[]) => void;
  disabled: boolean;
  plan: string;
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
  attachedFiles?: UploadedFile[];
  onAttachFiles?: (files: UploadedFile[]) => void;
  onRemoveFile?: (index: number) => void;
  placeholder?: string;
  mcpPct?: number;
  mcpUsed?: number;
  mcpLimit?: number;
  /** True while a stream is in flight — swaps the send button for a Stop button. */
  isStreaming?: boolean;
  /** Called when the user clicks the Stop button to abort the in-flight stream. */
  onStop?: () => void;
  /** Localized label for the stop button — defaults to English. */
  stopLabel?: string;
}

export function ChatInputBar({
  onSend,
  disabled,
  plan,
  selectedModel,
  onModelChange,
  attachedFiles = [],
  onAttachFiles,
  onRemoveFile,
  placeholder = "Ask about your revenue, risks, or what to fix first...",
  mcpPct = 0,
  mcpUsed = 0,
  mcpLimit = 0,
  isStreaming = false,
  onStop,
  stopLabel = "Stop",
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleVoiceTranscript(text: string) {
    setInput((prev) => (prev ? prev + " " + text : text));
    textareaRef.current?.focus();
  }

  // Click-to-attach file picker. The native <input type="file"> element
  // had `onChange={() => {}}` (literally a no-op) before this fix —
  // clicking the paperclip opened the picker but selected files were
  // silently dropped. We now route them through the same `processFileList`
  // pipeline that drag-and-drop uses (whitelist, size cap, content
  // slice) and lift them up via `onAttachFiles` so the parent state
  // owns the attached files set.
  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const processed = await processFileList(files);
    if (processed.length > 0) {
      onAttachFiles?.(processed);
    }
    // Reset so selecting the same file twice still triggers onChange.
    e.target.value = "";
  }

  // Radial usage bar helpers
  const usagePct = Math.min(100, mcpPct);
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (usagePct / 100) * circumference;
  const usageColor =
    usagePct >= 90 ? "stroke-red-500" :
    usagePct >= 70 ? "stroke-amber-500" :
    "stroke-emerald-500";

  return (
    <div className="shrink-0 px-4 pb-4 pt-2 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-content-faint/25 bg-surface-card px-4 py-3 shadow-sm backdrop-blur-sm transition-shadow focus-within:border-content-faint/40 focus-within:shadow-[0_0_24px_-4px_rgba(255,255,255,0.12)]">
        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((f, idx) => (
              <FileChip key={idx} file={f} onRemove={() => onRemoveFile?.(idx)} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-content-faint transition-colors hover:text-content-muted disabled:opacity-30"
            title="Attach file"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M14 9.5V12a2 2 0 01-2 2H4a2 2 0 01-2-2V9.5M8 10V2m0 0L5 5m3-3l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.txt,.md,.pdf"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-white placeholder-content-muted outline-none disabled:opacity-50"
          />

          {/* Right-side controls — all vertically centered */}
          <div className="mb-0.5 flex shrink-0 items-center gap-1.5">
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={disabled} />
            <ModelSelector selected={selectedModel} onSelect={onModelChange} plan={plan} />

            {/* Radial usage */}
            {mcpLimit > 0 && (
              <div className="group relative flex items-center justify-center" title={`${mcpUsed}/${mcpLimit} queries used`}>
                <svg width="18" height="18" viewBox="0 0 20 20" className="rotate-[-90deg]">
                  <circle cx="10" cy="10" r={radius} fill="none" className="stroke-surface-card" strokeWidth="2.5" />
                  <circle cx="10" cy="10" r={radius} fill="none" className={`${usageColor} transition-all duration-500`} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
                </svg>
                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-tooltip px-2 py-1 text-[10px] text-content-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {mcpUsed}/{mcpLimit} used
                </div>
              </div>
            )}

            {/* Send / Stop — swap based on stream state.
                During streaming the user needs an out: prior to this
                fix `useChatStream.abort()` existed but wasn't wired
                to any visible affordance, so a runaway response
                could only be cancelled by reloading the page. */}
            {isStreaming && onStop ? (
              <button
                onClick={onStop}
                title={stopLabel}
                aria-label={stopLabel}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-500"
              >
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={disabled || !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-30"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hints — outside the island */}
      <div className="mx-auto mt-1.5 flex max-w-3xl items-center justify-between px-1">
        <p className="text-[9px] text-content-faint">
          Enter send · Shift+Enter new line
        </p>
        {input.length > 1500 && (
          <span className={`font-mono text-[9px] ${input.length > 1900 ? "text-red-400" : "text-content-faint"}`}>
            {input.length}/2000
          </span>
        )}
      </div>
    </div>
  );
}
