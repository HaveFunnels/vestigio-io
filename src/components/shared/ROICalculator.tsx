"use client";

import { useState, useMemo } from "react";
import { ShinyButton } from "@/components/ui/shiny-button";
import Link from "next/link";

// ── i18n labels ─────────────────────────────────────────────────────
const LABELS = {
  en: {
    heading: "Discover how much revenue you're losing",
    revenueLabel: "Average monthly revenue",
    ticketLabel: "Average ticket",
    resultLabel: "Estimated monthly recovery",
    cta: "Get Started",
  },
  "pt-BR": {
    heading: "Descubra quanto faturamento você está perdendo",
    revenueLabel: "Faturamento mensal médio",
    ticketLabel: "Ticket médio",
    resultLabel: "Recuperação mensal estimada",
    cta: "Começar agora",
  },
} as const;

// ── Props ───────────────────────────────────────────────────────────
interface ROICalculatorProps {
  currencySymbol?: string;
  locale?: "en" | "pt-BR";
  heading?: string;
  ctaText?: string;
  ctaHref?: string;
}

function formatCurrency(value: number, locale: string, symbol: string): string {
  return `${symbol}${value.toLocaleString(locale)}`;
}

export function ROICalculator({
  currencySymbol = "R$",
  locale = "pt-BR",
  heading,
  ctaText,
  ctaHref = "/auth/signup",
}: ROICalculatorProps) {
  const l = LABELS[locale] ?? LABELS["pt-BR"];
  const resolvedHeading = heading ?? l.heading;
  const resolvedCta = ctaText ?? l.cta;

  const [monthlyRevenue, setMonthlyRevenue] = useState(100000);
  const [avgTicket, setAvgTicket] = useState(300);

  const results = useMemo(() => {
    const ticketImpactMultiplier = Math.min(avgTicket / 200, 2.0);
    const leakageLow =
      monthlyRevenue * 0.08 * Math.min(ticketImpactMultiplier, 1.5);
    const leakageHigh =
      monthlyRevenue * 0.15 * Math.min(ticketImpactMultiplier, 1.8);
    const recoveryLow = Math.round(leakageLow * 0.6);
    const recoveryHigh = Math.round(leakageHigh * 0.8);
    return { recoveryLow, recoveryHigh };
  }, [monthlyRevenue, avgTicket]);

  return (
    <section className="relative z-1 bg-[#090911] py-16 lg:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
        <h2 className="mb-10 text-center text-2xl font-semibold text-zinc-100 sm:text-3xl">
          {resolvedHeading}
        </h2>

        <div className="rounded-2xl border border-emerald-500/20 bg-white/[0.03] p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
            {/* Left column — Sliders */}
            <div className="flex flex-col justify-center">
              {/* Slider: Monthly Revenue */}
              <div className="mb-8">
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="roi-revenue"
                    className="text-sm font-medium text-zinc-300"
                  >
                    {l.revenueLabel}
                  </label>
                  <span className="text-sm font-semibold text-emerald-400">
                    {formatCurrency(monthlyRevenue, locale, currencySymbol)}
                  </span>
                </div>
                <input
                  id="roi-revenue"
                  type="range"
                  min={5000}
                  max={10000000}
                  step={5000}
                  value={monthlyRevenue}
                  onChange={(e) => setMonthlyRevenue(Number(e.target.value))}
                  className="roi-slider w-full"
                />
                <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
                  <span>{formatCurrency(5000, locale, currencySymbol)}</span>
                  <span>
                    {formatCurrency(10000000, locale, currencySymbol)}
                  </span>
                </div>
              </div>

              {/* Slider: Average Ticket */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="roi-ticket"
                    className="text-sm font-medium text-zinc-300"
                  >
                    {l.ticketLabel}
                  </label>
                  <span className="text-sm font-semibold text-emerald-400">
                    {formatCurrency(avgTicket, locale, currencySymbol)}
                  </span>
                </div>
                <input
                  id="roi-ticket"
                  type="range"
                  min={20}
                  max={40000}
                  step={50}
                  value={avgTicket}
                  onChange={(e) => setAvgTicket(Number(e.target.value))}
                  className="roi-slider w-full"
                />
                <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
                  <span>{formatCurrency(20, locale, currencySymbol)}</span>
                  <span>{formatCurrency(40000, locale, currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* Right column — Results */}
            <div className="flex flex-col items-center justify-center">
              <div className="w-full rounded-xl bg-emerald-500/[0.08] p-6 text-center sm:p-8">
                <p className="mb-3 text-sm text-zinc-400">{l.resultLabel}</p>
                <p
                  className="whitespace-nowrap text-2xl font-bold text-white sm:text-3xl lg:text-4xl"
                  style={{ textShadow: "0 0 40px rgba(16,185,129,0.3)" }}
                >
                  {formatCurrency(results.recoveryLow, locale, currencySymbol)}
                  {" — "}
                  {formatCurrency(
                    results.recoveryHigh,
                    locale,
                    currencySymbol,
                  )}
                </p>
              </div>

              {/* CTA */}
              <div className="mt-6 flex justify-center">
                <Link href={ctaHref}>
                  <ShinyButton>{resolvedCta}</ShinyButton>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slider styles */}
      <style>{`
        .roi-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
          outline: none;
          cursor: pointer;
          padding: 8px 0;
          box-sizing: content-box;
          background-clip: content-box;
        }
        .roi-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid #090911;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
          cursor: pointer;
          transition: box-shadow 0.15s;
          margin-top: -7px;
        }
        .roi-slider::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 5px rgba(16,185,129,0.35);
        }
        .roi-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid #090911;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
          cursor: pointer;
        }
        .roi-slider::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
        .roi-slider::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
        }
      `}</style>
    </section>
  );
}

export default ROICalculator;
