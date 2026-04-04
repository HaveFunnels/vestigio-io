"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShinyButton } from "@/components/ui/shiny-button";

type State = "input" | "loading" | "results";

const STATUS_KEYS = [
  "status_discovering",
  "status_checkout",
  "status_payment",
  "status_trust",
  "status_friction",
  "status_impact",
  "status_report",
] as const;

const STATUS_THRESHOLDS = [0, 15, 30, 45, 60, 75, 90];

interface Finding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  titleKey: string;
  impactMultiplier: [number, number]; // % of monthly revenue [min, max]
}

const FINDINGS: Finding[] = [
  { severity: "CRITICAL", titleKey: "finding_checkout_trust", impactMultiplier: [0.07, 0.18] },
  { severity: "CRITICAL", titleKey: "finding_chargeback_exposure", impactMultiplier: [0.05, 0.14] },
  { severity: "HIGH", titleKey: "finding_analytics_gap", impactMultiplier: [0.04, 0.12] },
  { severity: "MEDIUM", titleKey: "finding_scripts_slow", impactMultiplier: [0.02, 0.07] },
  { severity: "MEDIUM", titleKey: "finding_mobile_friction", impactMultiplier: [0.03, 0.10] },
];

const severityStyles: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border border-red-500/30",
  HIGH: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
};

function extractDomain(input: string): string {
  let cleaned = input.trim().replace(/^https?:\/\//, "");
  return cleaned.split("/")[0] || input.trim();
}

function formatCurrency(val: number): string {
  if (val >= 1000) return `$${Math.round(val / 1000)}k`;
  return `$${Math.round(val)}`;
}

const MiniCalculator = () => {
  const t = useTranslations("homepage.mini_calculator");
  const [state, setState] = useState<State>("input");
  const [url, setUrl] = useState("");
  const [revenue, setRevenue] = useState("");
  const [showRevenue, setShowRevenue] = useState(false);
  const [domain, setDomain] = useState("");
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [statusFading, setStatusFading] = useState(false);
  const revenueRef = useRef<HTMLInputElement>(null);

  const monthlyRevenue = Math.max(parseInt(revenue) || 100000, 10000);

  const handleSubmit = useCallback(() => {
    if (!url.trim()) return;
    if (!showRevenue) {
      setDomain(extractDomain(url));
      setShowRevenue(true);
      setTimeout(() => revenueRef.current?.focus(), 300);
      return;
    }
    setProgress(0);
    setStatusIdx(0);
    setStatusFading(false);
    setState("loading");
  }, [url, showRevenue]);

  // Progress: chunked increments at each threshold
  useEffect(() => {
    if (state !== "loading") return;

    const CHUNKS = [15, 30, 45, 60, 75, 90, 100];
    const CHUNK_DURATION = 1300; // ms per chunk
    let chunkIndex = 0;
    let animFrame: number;
    let startTime = performance.now();

    const tick = (now: number) => {
      if (chunkIndex >= CHUNKS.length) return;

      const elapsed = now - startTime;
      const target = CHUNKS[chunkIndex];
      const from = chunkIndex === 0 ? 0 : CHUNKS[chunkIndex - 1];
      const frac = Math.min(elapsed / CHUNK_DURATION, 1);
      const current = from + (target - from) * easeOut(frac);

      setProgress(current);

      if (frac >= 1) {
        // Move to next chunk
        chunkIndex++;
        startTime = now;

        if (chunkIndex < CHUNKS.length) {
          // Update status message with fade
          setStatusFading(true);
          setTimeout(() => {
            setStatusIdx(chunkIndex);
            setStatusFading(false);
          }, 250);
        }
      }

      if (chunkIndex < CHUNKS.length) {
        animFrame = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setState("results"), 500);
      }
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [state]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleReset = () => {
    setState("input");
    setUrl("");
    setRevenue("");
    setShowRevenue(false);
    setDomain("");
    setProgress(0);
  };

  // Compute impact from revenue
  const totalMin = FINDINGS.reduce((s, f) => s + f.impactMultiplier[0] * monthlyRevenue, 0);
  const totalMax = FINDINGS.reduce((s, f) => s + f.impactMultiplier[1] * monthlyRevenue, 0);

  return (
    <section className="relative z-1 overflow-hidden bg-[#090911] border-t border-zinc-800 py-20 lg:py-28">
      <div className="mx-auto w-full max-w-[800px] px-4 sm:px-8 xl:px-0">

        {/* ===================== INPUT ===================== */}
        {state === "input" && (
          <div className="text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-white lg:text-4xl xl:text-5xl">
              {t("title")}
            </h2>
            <p className="mb-10 text-base text-gray-400 max-w-[540px] mx-auto">
              {t("subtitle")}
            </p>

            <div className="flex flex-col items-center gap-4 max-w-[540px] mx-auto">
              {/* Domain input */}
              <div className="flex w-full flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("url_placeholder")}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 px-5 py-3.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/30"
                />
                {!showRevenue && (
                  <ShinyButton onClick={handleSubmit} className="shrink-0 w-full sm:w-auto" disabled={!url.trim()}>
                    {t("cta_audit")}
                  </ShinyButton>
                )}
              </div>

              {/* Revenue input — fades in from right */}
              {showRevenue && (
                <div
                  className="flex w-full flex-col sm:flex-row items-center gap-3"
                  style={{ animation: "fadeSlideRight 0.4s ease-out" }}
                >
                  <div className="relative w-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                    <input
                      ref={revenueRef}
                      type="number"
                      value={revenue}
                      onChange={(e) => setRevenue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t("revenue_placeholder")}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 pl-8 pr-5 py-3.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/30"
                    />
                  </div>
                  <ShinyButton onClick={handleSubmit} className="shrink-0 w-full sm:w-auto">
                    {t("cta_audit")}
                  </ShinyButton>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== LOADING ===================== */}
        {state === "loading" && (
          <div className="text-center">
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-white lg:text-3xl">
              {t("analyzing")} {domain}
            </h2>
            <p className="mb-10 text-sm text-zinc-500">{t("analyzing_sub")}</p>

            {/* Progress bar */}
            <div className="mx-auto max-w-[480px] mb-8">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${progress}%`,
                    boxShadow: "0 0 12px rgba(16,185,129,0.45)",
                    transition: "width 80ms linear",
                  }}
                />
              </div>
              <p className="mt-3 text-right text-xs font-mono text-zinc-500">
                {Math.round(progress)}%
              </p>
            </div>

            {/* Status message — fade down transition */}
            <div className="relative h-6 overflow-hidden">
              <p
                className="text-sm text-zinc-400"
                style={{
                  transition: "opacity 0.25s ease, transform 0.25s ease",
                  opacity: statusFading ? 0 : 1,
                  transform: statusFading ? "translateY(8px)" : "translateY(0)",
                }}
              >
                {t(STATUS_KEYS[statusIdx])}
              </p>
            </div>
          </div>
        )}

        {/* ===================== RESULTS ===================== */}
        {state === "results" && (
          <div>
            <div className="text-center mb-10">
              <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">
                {t("scan_complete")}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
                {t("results_for")}{" "}
                <span className="text-emerald-400">{domain}</span>
              </h2>
            </div>

            {/* Findings */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden mb-8">
              <div className="hidden sm:grid grid-cols-[100px_1fr_200px] gap-4 px-5 py-3 border-b border-zinc-800 text-xs font-mono uppercase tracking-wider text-zinc-500">
                <span>{t("col_severity")}</span>
                <span>{t("col_finding")}</span>
                <span className="text-right">{t("col_impact")}</span>
              </div>

              {FINDINGS.map((finding, i) => {
                const impMin = finding.impactMultiplier[0] * monthlyRevenue;
                const impMax = finding.impactMultiplier[1] * monthlyRevenue;
                return (
                  <div
                    key={i}
                    className={`sm:grid sm:grid-cols-[100px_1fr_200px] gap-4 px-5 py-4 items-center ${
                      i < FINDINGS.length - 1 ? "border-b border-zinc-800/60" : ""
                    }`}
                  >
                    <div className="mb-2 sm:mb-0">
                      <span className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${severityStyles[finding.severity]}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-200 mb-1 sm:mb-0">
                      {t(finding.titleKey)}
                    </p>
                    <p className="text-sm font-mono text-emerald-400 sm:text-right">
                      {formatCurrency(impMin)}–{formatCurrency(impMax)}/mo
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="text-center mb-12">
              <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">
                {t("total_impact")}
              </p>
              <p className="text-4xl font-bold text-white lg:text-5xl">
                <span className="text-emerald-400">
                  {formatCurrency(totalMin)}–{formatCurrency(totalMax)}
                </span>
                <span className="text-zinc-500 text-2xl lg:text-3xl">/mo</span>
              </p>
            </div>

            {/* CTA */}
            <div className="text-center">
              <p className="mb-6 text-base text-zinc-300">{t("cta_question")}</p>
              <div className="flex items-center justify-center gap-4 mb-6">
                <Link href="/auth/signup" className="rounded-[1rem] bg-white px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100">
                  {t("cta_signup")}
                </Link>
                <Link href="/pricing" className="rounded-[1rem] border border-white/20 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5">
                  {t("cta_pricing")}
                </Link>
              </div>
              <p className="text-xs text-zinc-600 max-w-[500px] mx-auto">{t("disclaimer")}</p>
              <button onClick={handleReset} className="mt-6 text-xs text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
                {t("scan_another")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fade-slide animation for revenue input */}
      <style jsx>{`
        @keyframes fadeSlideRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </section>
  );
};

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default MiniCalculator;
