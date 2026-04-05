"use client";

/**
 * ThinkingIndicator — Multi-stage animated indicator while Claude processes.
 * Shows: dots animation → "Thinking..." → tool-specific stage label.
 */

import { useState, useEffect } from "react";

interface ThinkingIndicatorProps {
  stage?: string; // e.g., "Analyzing findings...", "Tracing root causes..."
}

const THINKING_STAGES = [
  "Thinking",
  "Thinking.",
  "Thinking..",
  "Thinking...",
];

export function ThinkingIndicator({ stage }: ThinkingIndicatorProps) {
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotIndex((prev) => (prev + 1) % THINKING_STAGES.length);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-lg bg-surface-card px-4 py-2.5">
        {/* Animated dots */}
        <div className="flex gap-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.8s" }} />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.8s" }} />
        </div>

        {/* Stage label */}
        <span className="text-xs text-content-muted">
          {stage || THINKING_STAGES[dotIndex]}
        </span>
      </div>
    </div>
  );
}
