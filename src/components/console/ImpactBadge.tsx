"use client";

interface ImpactBadgeProps {
  min: number;
  max: number;
  currency?: string;
  compact?: boolean;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function ImpactBadge({ min, max, compact = false }: ImpactBadgeProps) {
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
        {formatCurrency(midpoint)}/mo
      </span>
    );
  }

  return (
    <span className={`font-mono text-xs ${color}`}>
      {formatCurrency(min)} – {formatCurrency(max)}/mo
    </span>
  );
}

export function ImpactValue({ value, label }: { value: number; label?: string }) {
  const color =
    value >= 5000
      ? "text-red-600 dark:text-red-400"
      : value >= 1000
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-600 dark:text-zinc-400";

  return (
    <div>
      <span className={`text-xl font-bold ${color}`}>{formatCurrency(value)}</span>
      {label && <span className="ml-1 text-xs text-content-muted">{label}</span>}
    </div>
  );
}
