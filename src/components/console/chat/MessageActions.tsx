"use client";

/**
 * MessageActions — Hover actions on chat messages.
 * Copy, retry, regenerate, fork, edit (user only),
 * thumbs up/down with comment field.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

interface MessageActionsProps {
  role: "user" | "assistant";
  content: string;
  messageId: string;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
  onFeedback?: (messageId: string, rating: "positive" | "negative", comment?: string) => void;
  /** Regenerate this specific assistant response (vs `onRetry` which
   *  always re-runs the LATEST user message). Lets the user re-roll
   *  any assistant turn in the conversation, not just the most
   *  recent one. */
  onRegenerate?: (messageId: string) => void;
  /** Fork the conversation from this message — creates a new
   *  conversation that copies everything up to and including this
   *  message, then navigates the user to the fork so they can
   *  continue along a different path without losing the prefix. */
  onFork?: (messageId: string) => void;
}

export function MessageActions({
  role,
  content,
  messageId,
  onRetry,
  onEdit,
  onFeedback,
  onRegenerate,
  onFork,
}: MessageActionsProps) {
  const t = useTranslations("console.message_actions");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);
  const [showCommentField, setShowCommentField] = useState(false);
  const [comment, setComment] = useState("");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API may fail */ }
  }

  function handleFeedbackClick(rating: "positive" | "negative") {
    setFeedback(rating);
    setShowCommentField(true);
  }

  function submitFeedback() {
    if (feedback) {
      const sanitized = comment
        .replace(/[<>&"']/g, "")
        .replace(/[\x00-\x1F\x7F]/g, "")
        .slice(0, 500)
        .trim();
      onFeedback?.(messageId, feedback, sanitized || undefined);
    }
    setShowCommentField(false);
  }

  function handleEditSubmit() {
    if (editText.trim() && editText !== content) {
      onEdit?.(editText.trim());
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content outline-none focus:border-emerald-600"
          rows={3}
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={handleEditSubmit} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500">{t("send_edited")}</button>
          <button onClick={() => { setEditing(false); setEditText(content); }} className="rounded-md border border-edge px-3 py-1 text-xs text-content-muted hover:text-content-secondary">{t("cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Copy */}
        <button onClick={handleCopy} className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted" title={t("copy")}>
          {copied ? (
            <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 16 16" fill="none"><path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" /><path d="M3 10.5V3.5A1.5 1.5 0 014.5 2h7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>
          )}
        </button>

        {/* Edit (user only) */}
        {role === "user" && onEdit && (
          <button onClick={() => setEditing(true)} className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted" title={t("edit_resend")}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* Retry (assistant only) — re-runs the LAST user message */}
        {role === "assistant" && onRetry && (
          <button onClick={onRetry} className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted" title={t("retry_last")}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0110.47-4M14 8a6 6 0 01-10.47 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><path d="M12 1v3h-3M4 15v-3h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* Regenerate (assistant only) — re-runs the user message
            that produced THIS specific response. Different from
            Retry: works on any assistant turn in the conversation,
            not just the most recent one. */}
        {role === "assistant" && onRegenerate && (
          <button
            onClick={() => onRegenerate(messageId)}
            className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted"
            title={t("regenerate")}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M14 8a6 6 0 11-2-4.5M14 1v3.5h-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Fork (any role) — creates a new conversation cloning
            messages up to and including this point. Lets the user
            try alternate questions from any turn without losing
            the shared prefix. */}
        {onFork && (
          <button
            onClick={() => onFork(messageId)}
            className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted"
            title={t("fork")}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.25" />
              <circle cx="4" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.25" />
              <circle cx="12" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M4 4.5v7M5.5 8.5C7 8 9 8 10.5 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Feedback (assistant only) */}
        {role === "assistant" && onFeedback && (
          <>
            <div className="mx-0.5 h-3 w-px bg-surface-inset" />
            <button
              onClick={() => handleFeedbackClick("positive")}
              className={`rounded p-1 ${feedback === "positive" ? "text-emerald-500" : "text-content-faint hover:bg-surface-card-hover hover:text-content-muted"}`}
              title={t("good_response")}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill={feedback === "positive" ? "currentColor" : "none"}>
                <path d="M4.5 7V14H2.5a1 1 0 01-1-1V8a1 1 0 011-1h2zm0 0l2-5.5a2 2 0 012 2V6h4.34a1 1 0 01.98 1.2l-1.17 5.5a1 1 0 01-.98.8H6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => handleFeedbackClick("negative")}
              className={`rounded p-1 ${feedback === "negative" ? "text-red-500" : "text-content-faint hover:bg-surface-card-hover hover:text-content-muted"}`}
              title={t("poor_response")}
            >
              <svg className="h-3.5 w-3.5 rotate-180" viewBox="0 0 16 16" fill={feedback === "negative" ? "currentColor" : "none"}>
                <path d="M4.5 7V14H2.5a1 1 0 01-1-1V8a1 1 0 011-1h2zm0 0l2-5.5a2 2 0 012 2V6h4.34a1 1 0 01.98 1.2l-1.17 5.5a1 1 0 01-.98.8H6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Comment field — appears after thumbs up/down */}
      {showCommentField && (
        <div className="mt-2 animate-in slide-in-from-bottom-2 duration-200">
          <div className="rounded-lg border border-edge bg-surface-card p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              {feedback === "positive" ? t("what_was_helpful") : t("what_could_be_better")}
              <span className="ml-1 font-normal normal-case text-content-faint">{t("optional")}</span>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder={feedback === "positive" ? t("positive_placeholder") : t("negative_placeholder")}
              className="mt-1.5 w-full resize-none rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs text-content-secondary placeholder-content-faint outline-none focus:border-edge"
              rows={2}
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-content-faint">{comment.length}/500</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCommentField(false); setFeedback(null); setComment(""); }}
                  className="rounded-md border border-edge px-2.5 py-1 text-[11px] text-content-muted hover:text-content-secondary"
                >
                  {t("skip")}
                </button>
                <button
                  onClick={submitFeedback}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                >
                  {t("submit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
