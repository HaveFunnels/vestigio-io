"use client";

/**
 * ChatInputBar — Input area with model selector, voice input, file chips,
 * send button, stop-generating button, and Shift+Enter support.
 *
 * Features:
 * - Animated cycling placeholder with per-letter blur-in/out
 * - Spring-animated container that expands on focus
 * - Mobile: secondary controls collapse into a "+" popover
 * - Desktop: inline controls
 * - `compact` prop forces mobile island layout
 */

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import type { ModelId } from "@/lib/chat-types";
import { MODELS } from "@/lib/chat-types";
import { ModelSelector } from "./ModelSelector";
import { VoiceInput } from "./VoiceInput";
import { FileChip, processFileList, type UploadedFile } from "./FileUploadZone";

// ── Animated per-letter cycling placeholder ──

function CyclingPlaceholder({ texts }: { texts: string[] }) {
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % texts.length);
        setShow(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, [texts.length]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
      <AnimatePresence mode="wait">
        {show && (
          <motion.span
            key={index}
            className="whitespace-nowrap text-sm text-content-muted select-none"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={{
              initial: {},
              animate: { transition: { staggerChildren: 0.02 } },
              exit: { transition: { staggerChildren: 0.012, staggerDirection: -1 } },
            }}
          >
            {texts[index].split("").map((char, i) => (
              <motion.span
                key={i}
                style={{ display: "inline-block" }}
                variants={{
                  initial: { opacity: 0, filter: "blur(8px)", y: 8 },
                  animate: {
                    opacity: 1,
                    filter: "blur(0px)",
                    y: 0,
                    transition: {
                      opacity: { duration: 0.2 },
                      filter: { duration: 0.35 },
                      y: { type: "spring", stiffness: 100, damping: 20 },
                    },
                  },
                  exit: {
                    opacity: 0,
                    filter: "blur(8px)",
                    y: -8,
                    transition: {
                      opacity: { duration: 0.15 },
                      filter: { duration: 0.25 },
                      y: { type: "spring", stiffness: 100, damping: 20 },
                    },
                  },
                }}
              >
                {char === " " ? "\u00A0" : char}
              </motion.span>
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ChatInputBar ──

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
  isStreaming?: boolean;
  onStop?: () => void;
  stopLabel?: string;
  /** Force mobile island layout regardless of viewport width */
  compact?: boolean;
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
  placeholder,
  isStreaming = false,
  onStop,
  stopLabel,
  compact = false,
}: ChatInputBarProps) {
  const t = useTranslations("console.chat_input");
  const [input, setInput] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cycling placeholder texts from translations
  const cyclingTexts = t.raw("cycling_placeholders") as string[];

  // Show animated placeholder only when: no custom placeholder, empty input, not focused, not disabled
  const showAnimatedPlaceholder = !placeholder && !input && !isFocused && !disabled && !isStreaming;

  // Container expands on focus or when has content
  const isExpanded = isFocused || input.length > 0 || attachedFiles.length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileMenuOpen]);

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

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const processed = await processFileList(files);
    if (processed.length > 0) {
      onAttachFiles?.(processed);
    }
    e.target.value = "";
  }

  return (
    <div className={`shrink-0 px-4 pt-2 ${compact ? "" : "sm:px-8"}`} style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}>
      <motion.div
        className={`mx-auto max-w-3xl rounded-2xl border bg-surface-card px-3 py-2.5 backdrop-blur-sm transition-colors ${
          isExpanded ? "border-content-faint/40" : "border-content-faint/25"
        } ${compact ? "" : "sm:px-4 sm:py-3"}`}
        animate={{
          boxShadow: isExpanded
            ? "0 0 24px -4px rgba(16,185,129,0.15)"
            : "0 1px 3px 0 rgba(0,0,0,0.08)",
          scale: isExpanded ? 1 : (compact ? 0.998 : 0.99),
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
          mass: 0.8,
        }}
      >
        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((f, idx) => (
              <FileChip key={idx} file={f} onRemove={() => onRemoveFile?.(idx)} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* ── Mobile / compact: "+" menu button ── */}
          <div className={`relative ${compact ? "" : "sm:hidden"}`} ref={menuRef}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              disabled={disabled}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                mobileMenuOpen
                  ? "bg-surface-inset text-content-secondary"
                  : "text-content-faint hover:text-content-muted"
              }`}
              aria-label="More options"
            >
              <svg className={`h-5 w-5 transition-transform duration-200 ${mobileMenuOpen ? "rotate-45" : ""}`} viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>

            {/* Mobile popover menu */}
            {mobileMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-edge bg-surface-card py-1.5 shadow-xl">
                {/* Attach file */}
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setMobileMenuOpen(false);
                  }}
                  disabled={disabled}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-30"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
                    <path d="M14 9.5V12a2 2 0 01-2 2H4a2 2 0 01-2-2V9.5M8 10V2m0 0L5 5m3-3l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t("attach_file")}
                </button>

                {/* Voice input */}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setTimeout(() => {
                      const voiceBtn = document.querySelector<HTMLButtonElement>("[data-voice-trigger]");
                      voiceBtn?.click();
                    }, 100);
                  }}
                  disabled={disabled}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-30"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="2" width="6" height="8" rx="3" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M3 8a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                  Voice input
                </button>

                {/* Model selector */}
                <div className="border-t border-edge/50 mt-1 pt-1">
                  <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-content-faint">
                    Model
                  </div>
                  {(Object.values(MODELS) as Array<(typeof MODELS)[ModelId]>).map((m) => {
                    const isDisabled = m.id === "opus_4_6" && !(plan === "pro" || plan === "max");
                    const isSelected = selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isDisabled) {
                            onModelChange(m.id);
                            setMobileMenuOpen(false);
                          }
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          isDisabled
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-surface-card-hover"
                        } ${isSelected ? "text-accent-text" : "text-content-muted"}`}
                      >
                        <span className="flex-1 text-left">{m.label}</span>
                        {m.queryCost > 1 && (
                          <span className="rounded border border-amber-700/30 bg-amber-500/10 px-1 py-0 text-[10px] font-medium text-amber-400">
                            {m.queryCost}x
                          </span>
                        )}
                        {isSelected && (
                          <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" viewBox="0 0 16 16" fill="none">
                            <path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

              </div>
            )}
          </div>

          {/* ── Desktop: inline file upload ── */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className={`h-10 w-10 shrink-0 items-center justify-center rounded-lg text-content-faint transition-colors hover:text-content-muted disabled:opacity-30 ${compact ? "hidden" : "hidden sm:flex"}`}
            title={t("attach_file")}
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

          {/* Textarea with animated placeholder overlay */}
          <div className="relative flex-1">
            {showAnimatedPlaceholder && (
              <CyclingPlaceholder texts={cyclingTexts} />
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled}
              placeholder={showAnimatedPlaceholder ? "" : (placeholder || t("placeholder"))}
              aria-label={placeholder || t("placeholder")}
              rows={1}
              className="min-h-[40px] w-full resize-none bg-transparent py-2.5 text-sm text-white placeholder-content-muted outline-none disabled:opacity-50"
            />
          </div>

          {/* ── Desktop: inline right-side controls ── */}
          <div className={`shrink-0 items-center gap-1.5 ${compact ? "hidden" : "hidden sm:flex"}`}>
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={disabled} />
            <ModelSelector selected={selectedModel} onSelect={onModelChange} plan={plan} />
          </div>

          {/* Send / Stop — always visible */}
          {isStreaming && onStop ? (
            <button
              onClick={onStop}
              title={stopLabel || t("stop")}
              aria-label={stopLabel || t("stop")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition-colors hover:bg-red-500"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={disabled || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-30"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </motion.div>

      {/* Hints — outside the island */}
      <div className="mx-auto mt-1.5 flex max-w-3xl items-center justify-between px-1">
        <p className={`text-[9px] text-content-faint ${compact ? "hidden" : "hidden sm:block"}`}>
          {t("hint_send")}
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
