"use client";

/**
 * ThinkingIndicator — Multi-stage animated indicator while Claude processes.
 * Shows: dots animation → "Thinking..." → tool-specific stage label.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface ThinkingIndicatorProps {
  stage?: string; // e.g., "Analyzing findings...", "Tracing root causes..."
}

const THINKING_KEYS = [
  "thinking",
  "thinking_1",
  "thinking_2",
  "thinking_3",
] as const;

export function ThinkingIndicator({ stage }: ThinkingIndicatorProps) {
  const t = useTranslations("console.thinking");
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotIndex((prev) => (prev + 1) % THINKING_KEYS.length);
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
          {stage || t(THINKING_KEYS[dotIndex])}
        </span>
      </div>
    </div>
  );
}
