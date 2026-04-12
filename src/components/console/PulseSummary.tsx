"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Pulse Summary — LLM-generated briefing
//
// Fetches from POST /api/workspace/pulse-summary
// on mount. Shows a loading skeleton, then renders
// the briefing text. If the API returns a fallback
// or errors, the component renders nothing.
// ──────────────────────────────────────────────

interface PulseSummaryProps {
  perspective?: string;
  findings?: unknown[];
  positiveChecks?: string[];
  cycleDelta?: Record<string, unknown>;
  maturityStage?: string;
}

export default function PulseSummary({
  perspective,
  findings,
  positiveChecks,
  cycleDelta,
  maturityStage,
}: PulseSummaryProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPulse() {
      try {
        const res = await fetch("/api/workspace/pulse-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            perspective,
            findings,
            positiveChecks,
            cycleDelta,
            maturityStage,
          }),
        });

        if (!res.ok) {
          if (!cancelled) {
            setLoading(false);
            setText(null);
          }
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          // If data.fallback is true or no text, hide the card
          if (data.fallback || !data.text) {
            setText(null);
          } else {
            setText(data.text);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setText(null);
        }
      }
    }

    fetchPulse();
    return () => {
      cancelled = true;
    };
  }, [perspective, findings, positiveChecks, cycleDelta, maturityStage]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-3 flex items-center gap-2">
          <svg
            className="h-4 w-4 text-emerald-400/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
            />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-content-faint">
            Vestigio Pulse
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3.5 w-[85%] animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3.5 w-[60%] animate-pulse rounded bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  // No text = hide entirely (fallback or error)
  if (!text) return null;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-4 w-4 text-emerald-400/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
          />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-content-faint">
          Vestigio Pulse
        </span>
      </div>
      <p className="text-sm leading-relaxed text-content-secondary">{text}</p>
    </div>
  );
}
