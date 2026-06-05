"use client";

import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import MethodologyPopover from "./MethodologyPopover";

interface ImpactBadgeProps {
  min: number;
  max: number;
  currency?: string;
  compact?: boolean;
  // Wave-22.6 review fix UC1 — optional methodology surfacing. When
  // these are provided, an "ⓘ" trigger renders next to the badge that
  // expands into the methodology popover (range, basis_type, baseline
  // rule). All optional so existing callsites work unchanged.
  basis_type?: string | null;
  severity?: "critical" | "high" | "medium" | "low" | null;
  cause?: string | null;
  effect?: string | null;
  /** Hide the methodology trigger even when basis_type is provided.
   *  Use for compact list views where the popover would feel cluttered. */
  hideMethodology?: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BRL: "R$", EUR: "€" };

function formatCurrency(value: number, sym: string): string {
  if (value >= 1000000) return `${sym}${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`;
  return `${sym}${Math.round(value)}`;
}

export default function ImpactBadge({
  min,
  max,
  currency,
  compact = false,
  basis_type,
  severity,
  cause,
  effect,
  hideMethodology = false,
}: ImpactBadgeProps) {
  const t = useTranslations("console.common");
  const { currency: orgCurrency } = useMcpData();
  const sym = CURRENCY_SYMBOLS[currency || orgCurrency] || "$";
  const midpoint = (min + max) / 2;

  const color =
    midpoint >= 5000
      ? "text-red-600 dark:text-red-400"
      : midpoint >= 1000
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-600 dark:text-zinc-400";

  const showMethodology = !hideMethodology && basis_type != null;

  if (compact) {
    return (
      <span className="inline-flex items-center">
        <span className={`font-mono text-xs ${color}`}>
          {formatCurrency(midpoint, sym)}
          {t("per_month_short")}
        </span>
        {showMethodology && (
          <MethodologyPopover
            min={min}
            max={max}
            currency={currency || orgCurrency}
            basis_type={basis_type}
            severity={severity ?? null}
            cause={cause ?? null}
            effect={effect ?? null}
          />
        )}
      </span>
    );
  }

  // Wave-22.6 — wide ranges (spread > 50% of midpoint) read as
  // expert hedging instead of expert opinion. When the range is
  // wider than that threshold, surface the midpoint only; the full
  // range stays available inside the MethodologyPopover for the
  // curious buyer. Threshold derived from a buyer-credibility lens:
  // a confident financial estimate stays within ±25% of its center.
  const spread = midpoint > 0 ? (max - min) / midpoint : 0;
  const showRange = spread <= 0.5;

  return (
    <span className="inline-flex items-center">
      <span className={`font-mono text-xs ${color}`}>
        {showRange
          ? `${formatCurrency(min, sym)} – ${formatCurrency(max, sym)}`
          : formatCurrency(midpoint, sym)}
        {t("per_month_short")}
      </span>
      {showMethodology && (
        <MethodologyPopover
          min={min}
          max={max}
          currency={currency || orgCurrency}
          basis_type={basis_type}
          severity={severity ?? null}
          cause={cause ?? null}
          effect={effect ?? null}
        />
      )}
    </span>
  );
}

export function ImpactValue({ value, label, currency }: { value: number; label?: string; currency?: string }) {
  const { currency: orgCurrency } = useMcpData();
  const sym = CURRENCY_SYMBOLS[currency || orgCurrency] || "$";
  const color =
    value >= 5000
      ? "text-red-600 dark:text-red-400"
      : value >= 1000
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-600 dark:text-zinc-400";

  return (
    <div>
      <span className={`text-xl font-bold ${color}`}>{formatCurrency(value, sym)}</span>
      {label && <span className="ml-1 text-xs text-content-muted">{label}</span>}
    </div>
  );
}
