"use client";

/**
 * ChatInputBar — Animated input island with expanding controls.
 *
 * Template pattern:
 * - Collapsed: input + send only, cycling blur placeholders
 * - Expanded (on click/focus): reveals attach, voice, model selector below
 * - White glow, white submit button, vertically centered elements
 */

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import type { ModelId } from "@/lib/chat-types";
import { ModelSelector } from "./ModelSelector";
import { VoiceInput } from "./VoiceInput";
import { FileChip, processFileList, type UploadedFile } from "./FileUploadZone";

// ── Animated per-letter cycling placeholder ──

const placeholderContainerVariants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.025 } },
  exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 as const } },
};

const letterVariants = {
  initial: { opacity: 0, filter: "blur(12px)", y: 10 },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: {
      opacity: { duration: 0.25 },
      filter: { duration: 0.4 },
      y: { type: "spring" as const, stiffness: 80, damping: 20 },
    },
  },
  exit: {
    opacity: 0,
    filter: "blur(12px)",
    y: -10,
    transition: {
      opacity: { duration: 0.2 },
      filter: { duration: 0.3 },
      y: { type: "spring" as const, stiffness: 80, damping: 20 },
    },
  },
};

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
    }, 3000);
    return () => clearInterval(interval);
  }, [texts.length]);

  return (
    <div className="pointer-events-none absolute left-0 top-0 flex h-full w-full items-center overflow-hidden">
      <AnimatePresence mode="wait">
        {show && (
          <motion.span
            key={index}
            className="absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm text-content-muted select-none pointer-events-none"
            variants={placeholderContainerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {texts[index].split("").map((char, i) => (
              <motion.span
                key={i}
                variants={letterVariants}
                style={{ display: "inline-block" }}
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

// ── Heights ──

const COLLAPSED_HEIGHT = 60;
const EXPANDED_HEIGHT = 112;
const COMPACT_COLLAPSED_HEIGHT = 56;
const COMPACT_EXPANDED_HEIGHT = 104;

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
  const [isActive, setIsActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cyclingTexts = t.raw("cycling_placeholders") as string[];
  const showAnimatedPlaceholder = !placeholder && !input && !isActive && !disabled && !isStreaming;
  const isExpanded = isActive || input.length > 0 || attachedFiles.length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        if (!input) setIsActive(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [input]);

  function handleActivate() {
    setIsActive(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

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

  const collapsedH = compact ? COMPACT_COLLAPSED_HEIGHT : COLLAPSED_HEIGHT;
  const expandedH = compact ? COMPACT_EXPANDED_HEIGHT : EXPANDED_HEIGHT;

  return (
    <div className={`shrink-0 px-4 pt-2 ${compact ? "" : "sm:px-8"}`} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}>
      <motion.div
        ref={wrapperRef}
        className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-surface-card backdrop-blur-sm"
        initial={false}
        animate={{
          height: isExpanded ? expandedH : collapsedH,
          boxShadow: isExpanded
            ? "0 4px 16px 0 rgba(255,255,255,0.08)"
            : "0 2px 8px 0 rgba(0,0,0,0.08)",
          borderColor: isExpanded
            ? "rgba(255,255,255,0.18)"
            : "rgba(255,255,255,0.08)",
        }}
        transition={{
          type: "spring",
          stiffness: 120,
          damping: 18,
        }}
        onClick={handleActivate}
      >
        <div className="flex h-full flex-col">
          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2">
              {attachedFiles.map((f, idx) => (
                <FileChip key={idx} file={f} onRemove={() => onRemoveFile?.(idx)} />
              ))}
            </div>
          )}

          {/* Input row — textarea + send only (controls expand below) */}
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt,.md,.pdf"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />

            {/* Text input & animated placeholder */}
            <div className="relative flex-1 flex items-center">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={handleActivate}
                disabled={disabled}
                placeholder={showAnimatedPlaceholder ? "" : (placeholder || t("placeholder"))}
                aria-label={placeholder || t("placeholder")}
                rows={1}
                className="min-h-[36px] w-full resize-none bg-transparent py-2 text-sm text-white placeholder-content-muted outline-none disabled:opacity-50"
                style={{ position: "relative", zIndex: 1 }}
              />
              {showAnimatedPlaceholder && (
                <CyclingPlaceholder texts={cyclingTexts} />
              )}
            </div>

            {/* Send / Stop — white fill, black icon */}
            {isStreaming && onStop ? (
              <button
                onClick={(e) => { e.stopPropagation(); onStop(); }}
                title={stopLabel || t("stop")}
                aria-label={stopLabel || t("stop")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
                disabled={disabled || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/80 disabled:opacity-30"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Expanded controls — attach, voice, model. Only visible on click/focus */}
          <motion.div
            className="flex items-center gap-2 px-4"
            variants={{
              hidden: {
                opacity: 0,
                y: 12,
                pointerEvents: "none" as const,
                transition: { duration: 0.2 },
              },
              visible: {
                opacity: 1,
                y: 0,
                pointerEvents: "auto" as const,
                transition: { duration: 0.3, delay: 0.06 },
              },
            }}
            initial="hidden"
            animate={isExpanded ? "visible" : "hidden"}
          >
            {/* Attach file */}
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              disabled={disabled}
              className="flex h-8 items-center gap-1.5 rounded-full bg-surface-inset px-3 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary disabled:opacity-30"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M14 9.5V12a2 2 0 01-2 2H4a2 2 0 01-2-2V9.5M8 10V2m0 0L5 5m3-3l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Attach
            </button>

            {/* Voice input */}
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={disabled} />

            {/* Model selector */}
            <ModelSelector selected={selectedModel} onSelect={onModelChange} plan={plan} />

            {/* Character counter */}
            {input.length > 1500 && (
              <span className={`ml-auto font-mono text-[10px] ${input.length > 1900 ? "text-red-400" : "text-content-faint"}`}>
                {input.length}/2000
              </span>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
