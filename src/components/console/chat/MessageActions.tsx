"use client";

/**
 * MessageActions — Hover actions on chat messages.
 * Copy, retry, edit (user only), thumbs up/down with comment field.
 */

import { useState } from "react";

interface MessageActionsProps {
  role: "user" | "assistant";
  content: string;
  messageId: string;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
  onFeedback?: (messageId: string, rating: "positive" | "negative", comment?: string) => void;
}

export function MessageActions({
  role,
  content,
  messageId,
  onRetry,
  onEdit,
  onFeedback,
}: MessageActionsProps) {
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
          <button onClick={handleEditSubmit} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500">Send edited</button>
          <button onClick={() => { setEditing(false); setEditText(content); }} className="rounded-md border border-edge px-3 py-1 text-xs text-content-muted hover:text-content-secondary">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Copy */}
        <button onClick={handleCopy} className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted" title="Copy">
          {copied ? (
            <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 16 16" fill="none"><path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" /><path d="M3 10.5V3.5A1.5 1.5 0 014.5 2h7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>
          )}
        </button>

        {/* Edit (user only) */}
        {role === "user" && onEdit && (
          <button onClick={() => setEditing(true)} className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted" title="Edit & resend">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* Retry (assistant only) */}
        {role === "assistant" && onRetry && (
          <button onClick={onRetry} className="rounded p-1 text-content-faint hover:bg-surface-card-hover hover:text-content-muted" title="Retry">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0110.47-4M14 8a6 6 0 01-10.47 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><path d="M12 1v3h-3M4 15v-3h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* Feedback (assistant only) */}
        {role === "assistant" && onFeedback && (
          <>
            <div className="mx-0.5 h-3 w-px bg-surface-inset" />
            <button
              onClick={() => handleFeedbackClick("positive")}
              className={`rounded p-1 ${feedback === "positive" ? "text-emerald-500" : "text-content-faint hover:bg-surface-card-hover hover:text-content-muted"}`}
              title="Good response"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill={feedback === "positive" ? "currentColor" : "none"}>
                <path d="M4.5 7V14H2.5a1 1 0 01-1-1V8a1 1 0 011-1h2zm0 0l2-5.5a2 2 0 012 2V6h4.34a1 1 0 01.98 1.2l-1.17 5.5a1 1 0 01-.98.8H6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => handleFeedbackClick("negative")}
              className={`rounded p-1 ${feedback === "negative" ? "text-red-500" : "text-content-faint hover:bg-surface-card-hover hover:text-content-muted"}`}
              title="Poor response"
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
              {feedback === "positive" ? "What was helpful?" : "What could be better?"}
              <span className="ml-1 font-normal normal-case text-content-faint">(optional)</span>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder={feedback === "positive" ? "This analysis was accurate because..." : "I expected a more specific answer about..."}
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
                  Skip
                </button>
                <button
                  onClick={submitFeedback}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
