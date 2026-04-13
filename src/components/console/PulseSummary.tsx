"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Pulse Summary — Intelligence briefing
// Styled to match dashboard widget cards.
// ──────────────────────────────────────────────

interface PulseSummaryProps {
  perspective?: string;
}

export default function PulseSummary({ perspective }: PulseSummaryProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchPulse() {
      try {
        const res = await fetch("/api/workspace/pulse-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perspective: perspective || "panorama", locale: "pt-BR" }),
        });
        if (!res.ok) { if (!cancelled) { setLoading(false); setText(null); } return; }
        const data = await res.json();
        if (!cancelled) { setText(data.fallback || !data.summary ? null : data.summary); setLoading(false); }
      } catch { if (!cancelled) { setLoading(false); setText(null); } }
    }
    fetchPulse();
    return () => { cancelled = true; };
  }, [perspective]);

  useEffect(() => {
    if (text && !revealed) { const t = setTimeout(() => setRevealed(true), 50); return () => clearTimeout(t); }
  }, [text, revealed]);

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-transparent" />
        <div className="relative mb-3 flex items-center gap-2">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">Vestigio Pulse</span>
        </div>
        <div className="relative space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-emerald-500/[0.06]" />
          <div className="h-3 w-[75%] animate-pulse rounded bg-emerald-500/[0.06]" />
        </div>
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-transparent" />
      <div className="relative mb-2 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">Vestigio Pulse</span>
        <span className="font-mono text-[10px] tabular-nums text-content-faint">
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <p className={`relative text-[13px] leading-[1.7] text-content-secondary transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
        {text}
      </p>
    </div>
  );
}
