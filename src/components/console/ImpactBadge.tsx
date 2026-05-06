"use client";

import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";

interface ImpactBadgeProps {
  min: number;
  max: number;
  currency?: string;
  compact?: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BRL: "R$", EUR: "€" };

function formatCurrency(value: number, sym: string): string {
  if (value >= 1000000) return `${sym}${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`;
  return `${sym}${Math.round(value)}`;
}

export default function ImpactBadge({ min, max, currency, compact = false }: ImpactBadgeProps) {
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

  if (compact) {
    return (
      <span className={`font-mono text-xs ${color}`}>
        {formatCurrency(midpoint, sym)}
        {t("per_month_short")}
      </span>
    );
  }

  return (
    <span className={`font-mono text-xs ${color}`}>
      {formatCurrency(min, sym)} – {formatCurrency(max, sym)}
      {t("per_month_short")}
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
