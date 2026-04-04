"use client";

/**
 * ChatInputBar — Input area with model selector, voice input, file chips,
 * send button, and Shift+Enter support.
 */

import { useState, useRef, useEffect } from "react";
import type { ModelId } from "@/lib/chat-types";
import { ModelSelector } from "./ModelSelector";
import { VoiceInput } from "./VoiceInput";
import { FileChip, type UploadedFile } from "./FileUploadZone";

interface ChatInputBarProps {
  onSend: (message: string, attachedFiles?: UploadedFile[]) => void;
  disabled: boolean;
  plan: string;
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
  attachedFiles?: UploadedFile[];
  onRemoveFile?: (index: number) => void;
  placeholder?: string;
  mcpPct?: number;
  mcpUsed?: number;
  mcpLimit?: number;
}

export function ChatInputBar({
  onSend,
  disabled,
  plan,
  selectedModel,
  onModelChange,
  attachedFiles = [],
  onRemoveFile,
  placeholder = "Ask about your revenue, risks, or what to fix first...",
  mcpPct = 0,
  mcpUsed = 0,
  mcpLimit = 0,
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
    <div className="border-t border-edge bg-surface-inset px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((f, idx) => (
              <FileChip key={idx} file={f} onRemove={() => onRemoveFile?.(idx)} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* File upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-edge text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-tertiary disabled:opacity-30"
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
            onChange={(e) => {
              // Handled by parent via FileUploadZone
            }}
          />

          {/* Textarea */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              className="w-full resize-none rounded-lg border border-edge bg-surface-card px-3.5 py-2.5 pr-24 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-edge-focus focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <VoiceInput onTranscript={handleVoiceTranscript} disabled={disabled} />
              <ModelSelector selected={selectedModel} onSelect={onModelChange} plan={plan} />
            </div>
          </div>

          {/* Radial usage indicator */}
          {mcpLimit > 0 && (
            <div className="group relative flex h-[42px] shrink-0 items-center justify-center" title={`${mcpUsed}/${mcpLimit} queries used`}>
              <svg width="20" height="20" viewBox="0 0 20 20" className="rotate-[-90deg]">
                <circle cx="10" cy="10" r={radius} fill="none" className="stroke-surface-card" strokeWidth="2.5" />
                <circle
                  cx="10" cy="10" r={radius}
                  fill="none"
                  className={`${usageColor} transition-all duration-500`}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-tooltip px-2 py-1 text-[10px] text-content-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {mcpUsed}/{mcpLimit} queries used
              </div>
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-[10px] text-content-faint">
            <kbd className="rounded border border-edge px-1 py-0.5 font-mono text-[9px]">Enter</kbd>{" "}send,{" "}
            <kbd className="rounded border border-edge px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd>{" "}new line
          </p>
          {input.length > 1500 && (
            <span className={`font-mono text-[10px] ${input.length > 1900 ? "text-red-400" : "text-content-faint"}`}>
              {input.length}/2000
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
