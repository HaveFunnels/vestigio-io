"use client";

import { useState, useEffect, useRef } from "react";

// ──────────────────────────────────────────────
// Pulse Summary — Intelligence briefing
//
// Full-width strip with emerald accent bar.
// Text reveals character-by-character on first load
// for that "receiving live intel" feel.
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
  const [revealed, setRevealed] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPulse() {
      try {
        const res = await fetch("/api/workspace/pulse-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            perspective: perspective || "panorama",
            findings: (findings || []).slice(0, 50).map((f: any) => ({
              title: f.title || "",
              severity: f.severity || "medium",
              impact_estimate: f.impact?.midpoint ? `$${f.impact.midpoint}/mo` : "unknown",
            })),
            positive_checks: positiveChecks || [],
            cycle_delta: cycleDelta || { improved: 0, worsened: 0, new: 0 },
            maturity_stage: maturityStage || "growth",
            locale: "pt-BR",
          }),
        });

        if (!res.ok) {
          if (!cancelled) { setLoading(false); setText(null); }
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          if (data.fallback || !data.text) {
            setText(null);
          } else {
            setText(data.text);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setLoading(false); setText(null); }
      }
    }

    fetchPulse();
    return () => { cancelled = true; };
  }, [perspective, findings, positiveChecks, cycleDelta, maturityStage]);

  // Reveal animation after text loads
  useEffect(() => {
    if (text && !revealed) {
      const timer = setTimeout(() => setRevealed(true), 50);
      return () => clearTimeout(timer);
    }
  }, [text, revealed]);

  if (loading) {
    return (
      <div className="relative flex overflow-hidden rounded border-l-2 border-emerald-500/40 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.02]">
        <div className="flex-1 px-5 py-4">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-600/70 dark:text-emerald-400/70">
              Vestigio Pulse
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded-sm bg-emerald-500/[0.06] dark:bg-white/[0.04]" />
            <div className="h-3 w-[80%] animate-pulse rounded-sm bg-emerald-500/[0.06] dark:bg-white/[0.04]" />
          </div>
        </div>
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="relative flex overflow-hidden rounded border-l-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/[0.03]">
      {/* Subtle scan line — dark mode only */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 dark:opacity-[0.015]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(16,185,129,1) 3px, rgba(16,185,129,1) 4px)",
        }}
      />

      <div className="relative flex-1 px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-700/70 dark:text-emerald-400/70">
            Vestigio Pulse
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-emerald-600/30 dark:text-emerald-400/30">
            {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p
          ref={textRef}
          className={`text-[13px] leading-[1.7] text-zinc-600 dark:text-zinc-300 transition-opacity duration-700 ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
