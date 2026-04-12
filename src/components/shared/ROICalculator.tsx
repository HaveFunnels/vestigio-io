"use client";

import { useState, useMemo } from "react";
import { ShinyButton } from "@/components/ui/shiny-button";
import Link from "next/link";

interface ROICalculatorProps {
  currencySymbol?: string;
  locale?: string;
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
  heading = "Descubra quanto faturamento você está perdendo",
  ctaText = "Start Free Trial",
  ctaHref = "/auth/signup",
}: ROICalculatorProps) {
  const [monthlyRevenue, setMonthlyRevenue] = useState(50000);
  const [avgTicket, setAvgTicket] = useState(200);

  const results = useMemo(() => {
    const leakageLow = monthlyRevenue * 0.08;
    const leakageHigh = monthlyRevenue * 0.15;
    const recoveryLow = Math.round(leakageLow * 0.6);
    const recoveryHigh = Math.round(leakageHigh * 0.8);
    return { recoveryLow, recoveryHigh };
  }, [monthlyRevenue]);

  return (
    <section className="relative z-1 bg-[#090911] py-16 lg:py-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-8">
        <h2 className="mb-10 text-center text-2xl font-semibold text-zinc-100 sm:text-3xl">
          {heading}
        </h2>

        <div className="rounded-2xl border border-emerald-500/20 bg-white/[0.03] p-6 sm:p-8">
          {/* Slider: Monthly Revenue */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="roi-revenue"
                className="text-sm font-medium text-zinc-300"
              >
                Faturamento mensal médio
              </label>
              <span className="text-sm font-semibold text-emerald-400">
                {formatCurrency(monthlyRevenue, locale, currencySymbol)}
              </span>
            </div>
            <input
              id="roi-revenue"
              type="range"
              min={5000}
              max={500000}
              step={5000}
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(Number(e.target.value))}
              className="roi-slider w-full"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
              <span>{formatCurrency(5000, locale, currencySymbol)}</span>
              <span>{formatCurrency(500000, locale, currencySymbol)}</span>
            </div>
          </div>

          {/* Slider: Average Ticket */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="roi-ticket"
                className="text-sm font-medium text-zinc-300"
              >
                Ticket médio
              </label>
              <span className="text-sm font-semibold text-emerald-400">
                {formatCurrency(avgTicket, locale, currencySymbol)}
              </span>
            </div>
            <input
              id="roi-ticket"
              type="range"
              min={50}
              max={2000}
              step={50}
              value={avgTicket}
              onChange={(e) => setAvgTicket(Number(e.target.value))}
              className="roi-slider w-full"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
              <span>{formatCurrency(50, locale, currencySymbol)}</span>
              <span>{formatCurrency(2000, locale, currencySymbol)}</span>
            </div>
          </div>

          {/* Results */}
          <div className="mb-6 rounded-xl bg-emerald-500/[0.08] p-5 text-center">
            <p className="mb-1 text-sm text-zinc-400">
              Recuperação mensal estimada
            </p>
            <p className="text-2xl font-bold text-emerald-400 sm:text-3xl">
              {formatCurrency(results.recoveryLow, locale, currencySymbol)} —{" "}
              {formatCurrency(results.recoveryHigh, locale, currencySymbol)}
            </p>
          </div>

          {/* 4X ROI Badge */}
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              4X ROI Guarantee
            </span>
          </div>

          {/* CTA */}
          <div className="flex justify-center">
            <Link href={ctaHref}>
              <ShinyButton>{ctaText}</ShinyButton>
            </Link>
          </div>
        </div>
      </div>

      {/* Slider styles */}
      <style>{`
        .roi-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
          outline: none;
          cursor: pointer;
        }
        .roi-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid #090911;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
          cursor: pointer;
          transition: box-shadow 0.15s;
        }
        .roi-slider::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 5px rgba(16,185,129,0.35);
        }
        .roi-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid #090911;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
          cursor: pointer;
        }
        .roi-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
        }
        .roi-slider::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
        }
      `}</style>
    </section>
  );
}

export default ROICalculator;
