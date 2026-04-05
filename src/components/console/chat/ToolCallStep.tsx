"use client";

/**
 * ToolCallStep — Claude Code VSCode-style tool execution indicator.
 * Collapsible step with spinner → checkmark transition.
 * Shows tool label, duration, and expandable result preview.
 */

import { useState } from "react";
import type { ToolCallBlock } from "@/lib/chat-types";

interface ToolCallStepProps {
  block: ToolCallBlock;
}

export function ToolCallStep({ block }: ToolCallStepProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = block.status === "running" || block.status === "pending";
  const isError = block.status === "error";
  const isComplete = block.status === "complete";

  return (
    <div className="my-1">
      <button
        onClick={() => block.resultPreview && setExpanded(!expanded)}
        className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
          isRunning
            ? "bg-emerald-500/5"
            : isError
              ? "bg-red-500/5 hover:bg-red-500/10"
              : "hover:bg-surface-inset"
        } ${block.resultPreview ? "cursor-pointer" : "cursor-default"}`}
      >
        {/* Status icon */}
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isRunning && (
            <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-emerald-500/30 border-t-emerald-400" />
          )}
          {isComplete && (
            <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 16 16" fill="none">
              <path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isError && (
            <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 16 16" fill="none">
              <path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </div>

        {/* Label */}
        <span
          className={`flex-1 text-xs ${
            isRunning
              ? "text-emerald-400"
              : isError
                ? "text-red-400"
                : "text-content-muted"
          }`}
        >
          {block.label}
        </span>

        {/* Duration */}
        {block.durationMs != null && (
          <span className="font-mono text-[10px] text-content-faint">
            {block.durationMs}ms
          </span>
        )}

        {/* Chevron */}
        {block.resultPreview && (
          <svg
            className={`h-3 w-3 text-content-faint transition-transform duration-150 ${
              expanded ? "rotate-90" : ""
            }`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Expanded result preview */}
      {expanded && block.resultPreview && (
        <div className="ml-6 mt-1 rounded-md border border-edge bg-surface px-3 py-2">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-content-muted">
            {block.resultPreview}
          </pre>
        </div>
      )}
    </div>
  );
}
